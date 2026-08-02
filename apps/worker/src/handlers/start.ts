import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import type { Job } from "@forteq/shared";
import {
  companies,
  companySettings,
  contentPlans,
  generationRuns,
  planEntries,
} from "@forteq/db";
import {
  createPipeline,
  resolveModelConfig,
  textProvidersUsed,
  DEFAULT_MODELS,
  type CompanyContext,
  type ModelConfig,
  type PipelineInput,
  type PlanEntryInput,
  type RunMeta,
} from "@forteq/pipeline";
import {
  runCompletedEvent,
  runFailedEvent,
  runFailedInbox,
  runNeedsReviewInbox,
} from "@forteq/shared";
import type { ModelFactoryBuilder } from "@forteq/pipeline";
import { withAccountScope, type HandlerContext } from "../composition.js";
import { openInbox, writeNotification } from "../lib/notify.js";
import { upsertContentItems } from "../lib/persist.js";
import { makeProgressReporter } from "../lib/progress.js";
import { enqueueVisuals } from "../lib/enqueueVisuals.js";
import { NoTenantKeyError, tenantModelsBuilder } from "../lib/tenantModels.js";

type GenerationStartJob = Extract<Job, { kind: "generation.start" }>;

/**
 * Хендлер job `generation.start` — свіжий прогін пайплайна (spike-1 §10 крок 2, §13, барʼєр B2).
 * Наявний `planEntryIds` → скоупнутий режим (Strategist skip/reduce, §7.2).
 *
 * Тверда межа транзакцій (§13): БД чіпаємо ЛИШЕ у коротких scoped-txn під RLS (job.accountId),
 * і НІКОЛИ не тримаємо txn відкритою під час виконання графа (LLM ідуть хвилинами).
 */
export async function handleStart(job: GenerationStartJob, ctx: HandlerContext): Promise<void> {
  const { accountId, runId, companyId } = job;
  const planEntryIds = job.planEntryIds ?? [];
  const scoped = planEntryIds.length > 0;
  ctx.logger.info({ runId, companyId, scoped }, "generation.start");

  // ── 1) КОРОТКА scoped-txn: завантажити контекст компанії та побудувати PipelineInput. Закрити txn. ──
  const input = await withAccountScope(ctx, accountId, async (tx) => {
    const [company] = await tx.select().from(companies).where(eq(companies.id, companyId));
    if (!company) throw new Error(`generation.start: company ${companyId} не знайдено`);

    const [settings] = await tx
      .select()
      .from(companySettings)
      .where(eq(companySettings.companyId, companyId));
    const [plan] = await tx
      .select()
      .from(contentPlans)
      .where(eq(contentPlans.companyId, companyId))
      .limit(1);
    const [run] = await tx.select().from(generationRuns).where(eq(generationRuns.id, runId));

    // Планскоуп: обрані слоти планера (провенанс id === plan_entries.id, §7.2) АБО явні теми з
    // run_config (Phase 2 — fan-out рівно на них, синтетичні id; plan_entries не чіпаємо).
    const providedTopics =
      (run?.runConfig as {
        topics?: Array<{ channel: string; topic: string; keyMessage?: string; seoKeywords?: string[] }>;
      } | undefined)?.topics ?? [];
    let planScope: PlanEntryInput[] | undefined;
    if (scoped) {
      const rows = await tx
        .select()
        .from(planEntries)
        .where(and(eq(planEntries.companyId, companyId), inArray(planEntries.id, planEntryIds)));
      planScope = rows.map((r) => ({
        id: r.id,
        channel: r.channel,
        topic: r.topic ?? "",
        keyMessage: r.keyMessage ?? undefined,
        seoKeywords: r.seoKeywords ?? [],
        pillar: r.pillar ?? undefined,
      }));
    } else if (providedTopics.length > 0) {
      planScope = providedTopics.map((t) => ({
        id: randomUUID(),
        channel: t.channel as PlanEntryInput["channel"],
        topic: t.topic,
        keyMessage: t.keyMessage,
        seoKeywords: t.seoKeywords ?? [],
      }));
    }
    // useScope: генеруємо ВИЗНАЧЕНІ теми (зі слотів або явні), а не вигадуємо повний план.
    const useScope = scoped || providedTopics.length > 0;

    const companyContext: CompanyContext = {
      name: company.name,
      positioning: company.positioning ?? undefined,
      stack: company.stack ?? [],
      services: company.services ?? [],
      audience: company.audience ?? undefined,
      toneOfVoice: settings?.toneOfVoice ?? undefined,
      toneExamples: settings?.toneExamples ?? [],
      visualStyle: settings?.visualStyle ?? undefined,
      forbiddenPhrases: settings?.forbiddenPhrases ?? [],
      language: settings?.language ?? "uk",
    };

    // ModelConfig — снапшот прогону (generation_runs.model_config) поверх company_settings, fallback DEFAULT_MODELS.
    let snapshot: Partial<ModelConfig> | undefined;
    if (run?.modelConfig) {
      snapshot = run.modelConfig as Partial<ModelConfig>;
    } else if (settings) {
      snapshot = {
        provider: settings.provider as ModelConfig["provider"],
        models: settings.models ?? undefined,
      };
    }
    const modelConfig = resolveModelConfig(snapshot, DEFAULT_MODELS);

    const meta: RunMeta = { runId, accountId, companyId };

    if (useScope) {
      return {
        company: companyContext,
        modelConfig,
        meta,
        planScope: planScope ?? [],
      } as PipelineInput;
    }
    if (!plan) throw new Error(`generation.start: content_plan для company ${companyId} не знайдено`);
    // Per-run лічильники (§spec 08): беремо зі ЗНІМКА прогону (він виграє над живим планом), фолбек —
    // план. Так конфігурація одного прогону керує к-стю постів, не зачіпаючи дефолти компанії.
    const snapCounts = (run?.modelConfig as { channelCounts?: Record<string, number> } | undefined)
      ?.channelCounts;
    return {
      company: companyContext,
      modelConfig,
      meta,
      channelConfig: snapCounts ?? plan.channelCounts,
    } as PipelineInput;
  });

  // ── 1.5) BYOK (§ADR-0016): резолвити ModelFactoryBuilder на ключі ОРЕНДАРЯ ДО запуску графа.
  // Немає ключа потрібного провайдера → прогін НЕ стартує (block, no fallback): фейлимо з чітким
  // повідомленням і задачею в Inbox, а не витрачаємо платформенний ключ на генерацію орендаря. ──
  let tenantModels: ModelFactoryBuilder;
  try {
    tenantModels = await tenantModelsBuilder(ctx, accountId, textProvidersUsed(input.modelConfig));
  } catch (e) {
    if (!(e instanceof NoTenantKeyError)) throw e;
    ctx.logger.warn({ runId, provider: e.provider }, "generation.start blocked: no tenant API key");
    await withAccountScope(ctx, accountId, async (tx) => {
      await tx.update(generationRuns).set({ status: "failed" }).where(eq(generationRuns.id, runId));
      await writeNotification(tx, accountId, runFailedEvent({ runId, error: e.message }));
      await openInbox(tx, accountId, runFailedInbox({ runId, companyId, error: e.message }));
      if (scoped) {
        await tx
          .update(planEntries)
          .set({ status: "proposed" })
          .where(and(eq(planEntries.companyId, companyId), inArray(planEntries.id, planEntryIds)));
      }
    });
    return;
  }

  // ── 2) КОРОТКА txn: status=running (+ скоуп: слоти → generating). Закрити txn. ──
  await withAccountScope(ctx, accountId, async (tx) => {
    await tx.update(generationRuns).set({ status: "running" }).where(eq(generationRuns.id, runId));
    if (scoped) {
      await tx
        .update(planEntries)
        .set({ status: "generating", runId })
        .where(and(eq(planEntries.companyId, companyId), inArray(planEntries.id, planEntryIds)));
    }
  });

  // ── 3) ПОЗА txn: виконати граф (worker — єдиний виконавець; LLM хвилинами). threadId === runId. ──
  // Per-node прогрес (§progress): onProgress персиститься окремими короткими txn під час стріму графа.
  const progress = makeProgressReporter(ctx, accountId, runId);
  // Пайплайн сам кличе deps.models(modelConfig) — тож підміняємо саме models на tenant-білдер (§ADR-0016).
  const res = await createPipeline({ ...ctx.pipeline, models: tenantModels }).start(input, runId, {
    onProgress: progress.onProgress,
  });
  await progress.flush(); // дочекатися всіх відкладених записів прогресу перед фінальним персистом

  // ── 4) НОВА scoped-txn: персист результату. ──
  await withAccountScope(ctx, accountId, async (tx) => {
    if (res.status === "failed") {
      ctx.logger.error({ runId, error: res.error }, "generation.start failed");
      await tx.update(generationRuns).set({ status: "failed" }).where(eq(generationRuns.id, runId));
      // §9.1 подія: впалий прогін — і сповіщення, і ЗАДАЧА (людині треба вирішити щодо перезапуску).
      const failEvt = runFailedEvent({ runId, error: res.error?.message });
      await writeNotification(tx, accountId, failEvt);
      await openInbox(tx, accountId, runFailedInbox({ runId, companyId, error: res.error?.message }));
      // §9.1: ревертнути зачеплені слоти generating→proposed (щоб не зависли у generating).
      if (scoped) {
        await tx
          .update(planEntries)
          .set({ status: "proposed" })
          .where(and(eq(planEntries.companyId, companyId), inArray(planEntries.id, planEntryIds)));
      }
      return;
    }

    // Рев'юнуті items → content_items (ідемпотентний upsert по f.id).
    await upsertContentItems(tx, runId, accountId, companyId, res.output.final);

    // interrupt (needs_review) або completed (approved) + cost + threadId.
    const runStatus = res.status === "needs_review" ? "needs_review" : "approved";
    await tx
      .update(generationRuns)
      .set({ status: runStatus, costCents: res.output.costCents, threadId: res.threadId })
      .where(eq(generationRuns.id, runId));

    // Скоуп: лінк content_item назад у слот (§13). f.id === plan_entries.id === content_item.id.
    if (scoped) {
      for (const f of res.output.final) {
        await tx
          .update(planEntries)
          .set({ status: "generated", contentItemId: f.id })
          .where(and(eq(planEntries.companyId, companyId), eq(planEntries.id, f.id)));
      }
    }

    // §9.1 доменні сигнали. needs_review — це ЗАДАЧА (пости чекають рішення людини), а не просто
    // інформація: без неї користувач мусив би тримати вкладку відкритою, щоб не проґавити прогін.
    const items = res.output.final.length;
    if (runStatus === "needs_review") {
      const flagged = res.output.final.filter((f) => f.status !== "approved").length;
      await openInbox(tx, accountId, runNeedsReviewInbox({ runId, companyId, items, flagged }));
    } else {
      await writeNotification(tx, accountId, runCompletedEvent({ runId, items, costCents: res.output.costCents }));
    }

    ctx.logger.info(
      { runId, status: runStatus, items, costCents: res.output.costCents },
      "generation.start persisted",
    );
  });

  // ── 5) ПІСЛЯ персисту: картинки фоном (§7.4). ──
  // Свідомо ПІСЛЯ txn: текст уже видно в рецензії, а зображення доїде окремо.
  // Помилка постановки job НЕ має валити успішний прогін (див. try/catch усередині).
  if (res.status !== "failed") {
    await enqueueVisuals(
      ctx,
      {
        runId,
        accountId,
        companyId,
        modelConfig: input.modelConfig,
        visualStyle: input.company.visualStyle,
      },
      res.output.final,
    );
  }
}
