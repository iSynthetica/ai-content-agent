import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import type { Job } from "@forteq/shared";
import { companySettings, contentItems, generationRuns } from "@forteq/db";
import {
  createPipeline,
  resolveModelConfig,
  textProvidersUsed,
  DEFAULT_MODELS,
  type HumanDecision,
  type ModelConfig,
} from "@forteq/pipeline";
import {
  runDecidedEvent,
  runFailedEvent,
  runFailedInbox,
  runNeedsReviewInbox,
} from "@forteq/shared";
import type { ModelFactoryBuilder } from "@forteq/pipeline";
import { withAccountScope, type HandlerContext } from "../composition.js";
import { openInbox, resolveInboxForEntity, writeNotification } from "../lib/notify.js";
import { upsertContentItems } from "../lib/persist.js";
import { makeProgressReporter } from "../lib/progress.js";
import { enqueueVisuals } from "../lib/enqueueVisuals.js";
import { notifyTelegramReady } from "../lib/telegramNotify.js";
import { NoTenantKeyError, tenantModelsBuilder } from "../lib/tenantModels.js";

type GenerationResumeJob = Extract<Job, { kind: "generation.resume" }>;
type Decision = GenerationResumeJob["decision"];

// Мапінг рішення черги (approve|reject|rerun) → доменний HumanDecision пайплайна (§9.1).
// rerun → request_revision: itemIds передаємо з БД (job-контракт їх поки не несе — spike-2 інкремент).
function toHumanDecision(d: Decision, itemIds: string[]): HumanDecision {
  switch (d.action) {
    case "approve":
      return { action: "approve" };
    case "reject":
      return { action: "reject", reason: d.feedback };
    case "rerun":
      return { action: "request_revision", itemIds, notes: d.feedback };
  }
}

/**
 * Хендлер job `generation.resume` — продовження після рішення людини (spike-1 §10 кроки 6-9, §13, B2).
 * БД чіпаємо лише у коротких scoped-txn під RLS; граф ганяємо ПОЗА txn (§13).
 */
export async function handleResume(job: GenerationResumeJob, ctx: HandlerContext): Promise<void> {
  const { accountId, runId, threadId } = job;
  ctx.logger.info({ runId, threadId, action: job.decision.action }, "generation.resume");

  // ── 0) КОРОТКА txn: ідемпотентність + companyId + (для rerun) цільові itemIds. ──
  const prep = await withAccountScope(ctx, accountId, async (tx) => {
    const [run] = await tx.select().from(generationRuns).where(eq(generationRuns.id, runId));
    if (!run) throw new Error(`generation.resume: run ${runId} не знайдено`);

    // Ідемпотентність (§10): повторний resume на вже завершеному прогоні — no-op.
    if (run.status === "approved" || run.status === "rejected") {
      return {
        skip: true as const,
        companyId: run.companyId,
        itemIds: [] as string[],
        modelConfig: undefined,
        visualStyle: undefined,
      };
    }

    let itemIds: string[] = [];
    if (job.decision.action === "rerun") {
      const items = await tx
        .select({ id: contentItems.id, status: contentItems.status })
        .from(contentItems)
        .where(eq(contentItems.runId, runId));
      // Мішень ревізії — items, що потребують уваги; якщо таких нема — беремо всі (щоб rerun не був no-op).
      itemIds = items.filter((i) => i.status === "needs_revision").map((i) => i.id);
      if (itemIds.length === 0) itemIds = items.map((i) => i.id);
    }
    // Для перемальовування картинок після ревізії (§7.4): модель — снапшот прогону, стиль — з налаштувань.
    const [settings] = await tx
      .select({ visualStyle: companySettings.visualStyle })
      .from(companySettings)
      .where(eq(companySettings.companyId, run.companyId));
    return {
      skip: false as const,
      companyId: run.companyId,
      itemIds,
      modelConfig: resolveModelConfig(run.modelConfig as Partial<ModelConfig> | undefined, DEFAULT_MODELS),
      visualStyle: settings?.visualStyle ?? undefined,
    };
  });

  if (prep.skip) {
    ctx.logger.info({ runId }, "generation.resume skipped (run already terminal)");
    return;
  }

  const { companyId, itemIds, modelConfig, visualStyle } = prep;
  const decision = toHumanDecision(job.decision, itemIds);

  // ── BYOK (§ADR-0016): ключ орендаря міг бути видалений між прогоном і resume. Резолвимо ДО
  // запуску графа; немає ключа → фейлимо прогін із чітким повідомленням (block, no fallback). ──
  let tenantModels: ModelFactoryBuilder;
  try {
    tenantModels = await tenantModelsBuilder(ctx, accountId, companyId, textProvidersUsed(modelConfig));
  } catch (e) {
    if (!(e instanceof NoTenantKeyError)) throw e;
    ctx.logger.warn({ runId, provider: e.provider }, "generation.resume blocked: no tenant API key");
    await withAccountScope(ctx, accountId, async (tx) => {
      await tx.update(generationRuns).set({ status: "failed" }).where(eq(generationRuns.id, runId));
      await writeNotification(tx, accountId, runFailedEvent({ runId, error: e.message }));
      await openInbox(tx, accountId, runFailedInbox({ runId, companyId, error: e.message }));
    });
    return;
  }

  // ── 1) КОРОТКА txn: status=running. ──
  await withAccountScope(ctx, accountId, async (tx) => {
    await tx.update(generationRuns).set({ status: "running" }).where(eq(generationRuns.id, runId));
  });

  // ── 2) ПОЗА txn: Command({ resume }) → END (approve/reject) АБО петля revision → знову interrupt. ──
  // Per-node прогрес (§progress): onProgress персиститься окремими короткими txn під час стріму графа.
  const progress = makeProgressReporter(ctx, accountId, runId);
  // models — на ключі орендаря (§ADR-0016); решта deps без змін.
  const res = await createPipeline({ ...ctx.pipeline, models: tenantModels }).resume(threadId, decision, {
    onProgress: progress.onProgress,
  });
  await progress.flush(); // дочекатися всіх відкладених записів прогресу перед фінальним персистом

  // ── 3) НОВА scoped-txn: персист результату. Повертаємо статус для after-commit хуків (§5). ──
  const persisted = await withAccountScope(
    ctx,
    accountId,
    async (tx): Promise<{ status: "failed" | "needs_review" | "approved" | "rejected" }> => {
    if (res.status === "failed") {
      ctx.logger.error({ runId, error: res.error }, "generation.resume failed");
      await tx.update(generationRuns).set({ status: "failed" }).where(eq(generationRuns.id, runId));
      await writeNotification(tx, accountId, runFailedEvent({ runId, error: res.error?.message }));
      await openInbox(tx, accountId, runFailedInbox({ runId, companyId, error: res.error?.message }));
      return { status: "failed" };
    }

    await upsertContentItems(tx, runId, accountId, companyId, res.output.final);

    if (res.status === "needs_review") {
      // request_revision → граф знову веде до interrupt (крок 8-9 §10).
      await tx
        .update(generationRuns)
        .set({ status: "needs_review", costCents: res.output.costCents, threadId: res.threadId })
        .where(eq(generationRuns.id, runId));
      // Ревізія знову привела до гейту → задача лишається/оновлюється (openInbox ідемпотентний).
      const items = res.output.final.length;
      const flagged = res.output.final.filter((f) => f.status !== "approved").length;
      await openInbox(tx, accountId, runNeedsReviewInbox({ runId, companyId, items, flagged }));
      ctx.logger.info({ runId }, "generation.resume → needs_review (revision loop)");
      return { status: "needs_review" };
    }

    // completed: явний мапінг рішення людини (§13 крок 9). reject→rejected; інакше (approve або
    // request_revision, що дійшов до done через вичерпаний бюджет) → approved.
    const runStatus = decision.action === "reject" ? "rejected" : "approved";
    await tx
      .update(generationRuns)
      .set({ status: runStatus, costCents: res.output.costCents, threadId: res.threadId })
      .where(eq(generationRuns.id, runId));
    // Workflow-статус айтемів поверх QA-статусу — ЛИШЕ на явне рішення людини (approve/reject);
    // на capped-revision лишаємо QA-статуси з upsert (не затираємо).
    if (decision.action === "approve" || decision.action === "reject") {
      await tx
        .update(contentItems)
        .set({ status: decision.action === "reject" ? "rejected" : "approved" })
        .where(eq(contentItems.runId, runId));
    }

    // §9.1 доменні сигнали: рішення ухвалене → інформаційний слід у стрічці, а задача «перевірте
    // N постів» ЗАКРИВАЄТЬСЯ автоматично — інакше вона висіла б в Inbox після того, як питання
    // вже вирішене, і користувач мусив би закривати її вручну.
    await writeNotification(tx, accountId, runDecidedEvent({ runId, approved: runStatus === "approved" }));
    await resolveInboxForEntity(tx, accountId, runId);

    ctx.logger.info({ runId, status: runStatus }, "generation.resume persisted");
    return { status: runStatus };
  });

  // ── 3.5) ПІСЛЯ персисту, ПОЗА txn: best-effort Telegram-пінг (§5) — лише коли ревізія знову
  // привела до гейту рецензії. Збій сповіщення НЕ валить прогін (як enqueueVisuals нижче). ──
  if (persisted.status === "needs_review") {
    await notifyTelegramReady(ctx, accountId, runId);
  }

  // ── 4) ПІСЛЯ персисту: перемалювати картинки переписаних instagram-постів (§7.4). ──
  // Тільки для rerun: текст змінився → стара картинка йому вже не відповідає. Інвалідуємо явно
  // (upsert поле image_url НЕ чіпає — власник один, job content.visuals) і ставимо перемальовування.
  if (res.status !== "failed" && job.decision.action === "rerun" && itemIds.length > 0) {
    const revised = new Set(itemIds);
    const igRevised = res.output.final.filter((f) => f.channel === "instagram" && revised.has(f.id));
    if (igRevised.length > 0) {
      await withAccountScope(ctx, accountId, async (tx) => {
        for (const f of igRevised) {
          await tx.update(contentItems).set({ imageUrl: null }).where(eq(contentItems.id, f.id));
        }
      });
      await enqueueVisuals(
        ctx,
        { runId, accountId, companyId, modelConfig, visualStyle },
        res.output.final,
        // nonce: jobId детермінований, тож без нього BullMQ відкинув би перемальовування як дубль
        // початкової job. Похідні від runId/threadId тут не годяться — вони сталі між ревізіями,
        // і друга ревізія знову впала б у дедуп. Кожна ревізія — це справді нова робота.
        { only: revised, nonce: randomUUID() },
      );
    }
  }
}
