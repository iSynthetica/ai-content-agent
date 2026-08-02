import { and, eq, isNull } from "drizzle-orm";
import type { Job } from "@forteq/shared";
import { contentItems } from "@forteq/db";
import { renderVisuals, resolveModelConfig, DEFAULT_MODELS, type ModelConfig } from "@forteq/pipeline";
import { withAccountScope, type HandlerContext } from "../composition.js";
import { NoTenantKeyError, tenantModelsBuilder } from "../lib/tenantModels.js";

type ContentVisualsJob = Extract<Job, { kind: "content.visuals" }>;

/**
 * Хендлер job `content.visuals` (§7.4) — малює зображення ПІСЛЯ того, як прогін уже дійшов до
 * рецензії. Винесено з графа тому, що одна картинка gpt-image-1 ≈ 40с, і людина чекала на неї,
 * щоб прочитати ТЕКСТ. Тепер текст доступний одразу, а image_url доїжджає окремо.
 *
 * Тверда межа транзакцій (§13) збережена: генерація (хвилини) — ПОЗА txn, у БД ходимо лише
 * короткими scoped-txn під RLS.
 */
export async function handleContentVisuals(
  job: ContentVisualsJob,
  ctx: HandlerContext,
): Promise<void> {
  const { accountId, runId, targets } = job;
  ctx.logger.info({ runId, targets: targets.length }, "content.visuals");

  // Ідемпотентність: перемальовуємо лише те, що ще без картинки. Захищає від повторної оплати
  // при retry job'и та від гонки з ревізією, яка вже могла проставити свіжий URL.
  const pending = await withAccountScope(ctx, accountId, async (tx) => {
    const rows = await tx
      .select({ id: contentItems.id })
      .from(contentItems)
      .where(and(eq(contentItems.runId, runId), isNull(contentItems.imageUrl)));
    const need = new Set(rows.map((r) => r.id));
    return targets.filter((t) => need.has(t.itemId));
  });

  if (pending.length === 0) {
    ctx.logger.info({ runId }, "content.visuals: нічого малювати (усі вже мають image_url)");
    return;
  }

  // ── ПОЗА txn: власне генерація (хвилини). ──
  const modelConfig: ModelConfig = resolveModelConfig(
    job.modelConfig as Partial<ModelConfig>,
    DEFAULT_MODELS,
  );
  // BYOK (§ADR-0016): зображення завжди OpenAI → потрібен openai-ключ ОРЕНДАРЯ. Немає ключа —
  // НЕ фейлимо job (картинки поза критичним шляхом): лишаємо image_url=null і виходимо.
  let models;
  try {
    const build = await tenantModelsBuilder(ctx, accountId, "openai");
    models = build(modelConfig);
  } catch (e) {
    if (!(e instanceof NoTenantKeyError)) throw e;
    ctx.logger.warn({ runId }, "content.visuals: немає openai-ключа орендаря — зображення пропущено");
    return;
  }
  const { rendered, errors } = await renderVisuals(
    { models, imageStore: ctx.pipeline.imageStore },
    runId,
    pending,
  );

  // ── КОРОТКА scoped-txn: розкласти URL по рядках. ──
  if (rendered.length > 0) {
    await withAccountScope(ctx, accountId, async (tx) => {
      for (const r of rendered) {
        await tx
          .update(contentItems)
          .set({ imageUrl: r.url })
          .where(eq(contentItems.id, r.itemId));
      }
    });
  }

  // Впала картинка НЕ валить job: текст уже в рецензії й цінний сам по собі, а image_url
  // лишається null → UI покаже пост без зображення (і його можна перемалювати повторним enqueue).
  if (errors.length > 0) {
    ctx.logger.warn({ runId, errors }, "content.visuals: частина зображень не згенерувалась");
  }
  ctx.logger.info(
    { runId, rendered: rendered.length, failed: errors.length },
    "content.visuals persisted",
  );
}
