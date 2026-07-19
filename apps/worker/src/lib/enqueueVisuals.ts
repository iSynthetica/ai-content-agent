// Постановка follow-up job `content.visuals` (§7.4). Спільна для start і resume, щоб правило
// «які пости потребують картинки» жило в одному місці.
import { buildImagePrompt, type FinalItem, type ModelConfig } from "@forteq/pipeline";
import type { HandlerContext } from "../composition.js";

export interface EnqueueVisualsScope {
  runId: string;
  accountId: string;
  companyId: string;
  modelConfig: ModelConfig;
  visualStyle: string | undefined;
}

/**
 * Ставить job на малювання картинок для instagram-постів, що їх ще не мають.
 *
 * Промпт будується САМЕ ТУТ: поки під рукою є draft.metadata.imagePromptSuggestion (у content_items
 * воно не персиститься) і visualStyle компанії. Далі промпт їде у payload готовим, і хендлеру
 * не треба перечитувати ні компанію, ні драфти.
 *
 * nonce потрібен для ревізії: jobId детермінований (BullMQ дедуплікує), тож перемальовування
 * після переписаного тексту мусить мати ІНШИЙ id, інакше черга відкине його як дубль.
 */
export async function enqueueVisuals(
  ctx: HandlerContext,
  scope: EnqueueVisualsScope,
  final: readonly FinalItem[],
  opts: { only?: ReadonlySet<string>; nonce?: string } = {},
): Promise<void> {
  const targets = final
    .filter((f) => f.channel === "instagram")
    .filter((f) => !opts.only || opts.only.has(f.id))
    .map((f) => ({
      itemId: f.id,
      prompt: buildImagePrompt({
        text: f.text,
        imagePromptSuggestion: f.metadata.imagePromptSuggestion,
        visualStyle: scope.visualStyle,
      }),
    }));

  if (targets.length === 0) return;
  if (!ctx.producer) {
    ctx.logger.warn({ runId: scope.runId }, "content.visuals не поставлено: producer не сконфігуровано");
    return;
  }

  try {
    await ctx.producer.enqueue({
      kind: "content.visuals",
      jobId: opts.nonce ? `visuals-${scope.runId}-${opts.nonce}` : `visuals-${scope.runId}`,
      accountId: scope.accountId,
      runId: scope.runId,
      companyId: scope.companyId,
      modelConfig: scope.modelConfig,
      targets,
    });
  } catch (e) {
    // Прогін уже успішно збережений — не «відкочуємо» його через проблему з чергою.
    ctx.logger.error(
      { runId: scope.runId, err: e instanceof Error ? e.message : String(e) },
      "не вдалося поставити content.visuals",
    );
  }
}
