// Трекінг вартості (§7, §9 spike-1). usage_metadata живе на ВІДПОВІДІ (AIMessage), тож
// structured-виклики роблять withStructuredOutput(Schema, { includeRaw: true }) → { parsed, raw }.
// costFromUsage читає raw.usage_metadata; image-моделі usage не віддають → imageCost (фіксована ціна).
import { imageModelPriceCents, textModelPrice } from "@forteq/shared";
import type { RunCost } from "../state";

// Форма usage_metadata на AIMessage (@langchain/core).
export interface UsageMetadata {
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
}

// Прайс живе у @forteq/shared (pricing.ts) — ЄДИНЕ джерело для фактичної вартості (тут) і для
// пре-ран естиматора. Раніше локальна PRICE_TABLE знала лише gpt-4.x/claude-3.5, тож усі реальні
// прогони (gpt-5.x/claude-opus-4-8/gemini) косили вартість через DEFAULT_PRICE.

// costFromUsage — вартість LLM-виклику з usage_metadata. cents тримаємо float (округлення лише
// при мапінгу в PipelineOutput.costCents), щоб не накопичувати похибку per-invoke (§3, addCost).
export function costFromUsage(usage: UsageMetadata | undefined, modelId: string): RunCost {
  const input = usage?.input_tokens ?? 0;
  const output = usage?.output_tokens ?? 0;
  const tokens = usage?.total_tokens ?? input + output;
  const price = textModelPrice(modelId);
  const dollars = (input / 1_000_000) * price.inputPer1M + (output / 1_000_000) * price.outputPer1M;
  return { cents: dollars * 100, tokens };
}

// imageCost — фіксована вартість зображення (§7.4). tokens=0 (image API токенів не рахує).
export function imageCost(modelId: string): RunCost {
  return { cents: imageModelPriceCents(modelId), tokens: 0 };
}
