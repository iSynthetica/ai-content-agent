// Visuals (§7.4) — генерація зображень для Instagram.
//
// ЧОМУ ЦЕ НЕ ВУЗОЛ ГРАФА (зміна проти spike-1): одна картинка gpt-image-1 займає ~40с, і поки
// visual сидів на шляху writer→reviewer, прогін доходив до needs_review за ~64с, з яких 41с —
// саме малювання. Людині для рецензії потрібен ТЕКСТ, тож картинки винесені з критичного шляху:
// граф завершується без них, worker ставить окрему job `content.visuals`, а URL доїжджає
// у content_items.image_url. Логіка промпта лишилась тут — це домен пайплайна, не worker'а.
import { mapPool } from "./lib/mapPool";
import { IMAGE_CONCURRENCY } from "./config";
import type { ImageStore, ModelFactory } from "./ports";

// Промпт будується у момент ПОСТАНОВКИ job (там ще є draft.metadata і visualStyle компанії),
// далі їде у payload — хендлеру не треба перечитувати ні компанію, ні драфти.
export function buildImagePrompt(input: {
  text: string;
  imagePromptSuggestion?: string;
  visualStyle?: string;
}): string {
  return (
    `${input.imagePromptSuggestion ?? input.text.slice(0, 200)}. ` +
    `Стиль бренду: ${input.visualStyle ?? "clean, modern, professional"}. ` +
    `Без тексту на зображенні.`
  );
}

export interface VisualTarget {
  itemId: string;
  prompt: string;
}

export interface RenderedVisual {
  itemId: string;
  url: string;
}

/**
 * Малює зображення для targets і кладе їх у ImageStore. Паралелить вужчим пулом, ніж текстові
 * вузли: images API жорсткіший за rate-limit. Ізоляція per-item (NFR-2.2) збережена — впала
 * одна картинка не заважає решті доїхати, помилки повертаються окремим списком.
 */
export async function renderVisuals(
  deps: { models: ModelFactory; imageStore: ImageStore },
  runId: string,
  targets: readonly VisualTarget[],
): Promise<{ rendered: RenderedVisual[]; errors: string[] }> {
  const settled = await mapPool(targets, IMAGE_CONCURRENCY, async (t) => {
    const { bytes, contentType } = await deps.models.imageModel().generate({
      prompt: t.prompt,
      size: "1024x1024",
    });
    const { url } = await deps.imageStore.put(bytes, {
      runId,
      draftId: t.itemId,
      contentType,
    });
    return url;
  });

  const rendered: RenderedVisual[] = [];
  const errors: string[] = [];
  settled.forEach((r, i) => {
    const t = targets[i]!;
    if (r.ok) rendered.push({ itemId: t.itemId, url: r.value });
    else errors.push(`visual ${t.itemId}: ${r.error instanceof Error ? r.error.message : String(r.error)}`);
  });

  return { rendered, errors };
}
