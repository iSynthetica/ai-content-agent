// Трекінг вартості (§7, §9 spike-1). usage_metadata живе на ВІДПОВІДІ (AIMessage), тож
// structured-виклики роблять withStructuredOutput(Schema, { includeRaw: true }) → { parsed, raw }.
// costFromUsage читає raw.usage_metadata; image-моделі usage не віддають → imageCost (фіксована ціна).
import type { RunCost } from "../state";

// Форма usage_metadata на AIMessage (@langchain/core).
export interface UsageMetadata {
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
}

// Прайс за 1M токенів (USD). Приблизні орієнтири для МВП-трекінгу; калібруються за потреби.
interface ModelPrice {
  inputPer1M: number;
  outputPer1M: number;
}

const PRICE_TABLE: Record<string, ModelPrice> = {
  "gpt-4.1": { inputPer1M: 2.0, outputPer1M: 8.0 },
  "gpt-4.1-mini": { inputPer1M: 0.4, outputPer1M: 1.6 },
  "gpt-4.1-nano": { inputPer1M: 0.1, outputPer1M: 0.4 },
  "gpt-4o": { inputPer1M: 2.5, outputPer1M: 10.0 },
  "gpt-4o-mini": { inputPer1M: 0.15, outputPer1M: 0.6 },
  "claude-3-5-sonnet-latest": { inputPer1M: 3.0, outputPer1M: 15.0 },
  "claude-3-5-haiku-latest": { inputPer1M: 0.8, outputPer1M: 4.0 },
};

// Фолбек, коли модель не в таблиці — консервативна оцінка, щоб вартість не була 0.
const DEFAULT_PRICE: ModelPrice = { inputPer1M: 1.0, outputPer1M: 3.0 };

// Фіксована ціна за одне згенероване зображення (центи). Image API usage_metadata не віддає.
const IMAGE_PRICE_CENTS: Record<string, number> = {
  "gpt-image-1": 4.0,
  "dall-e-3": 4.0,
  "dall-e-2": 2.0,
};
const DEFAULT_IMAGE_CENTS = 4.0;

// costFromUsage — вартість LLM-виклику з usage_metadata. cents тримаємо float (округлення лише
// при мапінгу в PipelineOutput.costCents), щоб не накопичувати похибку per-invoke (§3, addCost).
export function costFromUsage(usage: UsageMetadata | undefined, modelId: string): RunCost {
  const input = usage?.input_tokens ?? 0;
  const output = usage?.output_tokens ?? 0;
  const tokens = usage?.total_tokens ?? input + output;
  const price = PRICE_TABLE[modelId] ?? DEFAULT_PRICE;
  const dollars = (input / 1_000_000) * price.inputPer1M + (output / 1_000_000) * price.outputPer1M;
  return { cents: dollars * 100, tokens };
}

// imageCost — фіксована вартість зображення (§7.4). tokens=0 (image API токенів не рахує).
export function imageCost(modelId: string): RunCost {
  return { cents: IMAGE_PRICE_CENTS[modelId] ?? DEFAULT_IMAGE_CENTS, tokens: 0 };
}
