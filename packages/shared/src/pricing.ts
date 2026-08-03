// Прайс моделей (USD за 1M токенів) — ЄДИНЕ джерело істини для двох споживачів, які раніше
// розходились мовчки:
//   1) packages/pipeline/src/lib/cost.ts — ФАКТИЧНА вартість прогону з usage_metadata (показується
//      на сторінці прогону). Її PRICE_TABLE знав лише gpt-4.x/claude-3.5 — усі реальні прогони на
//      gpt-5.x/claude-opus-4-8/gemini падали у DEFAULT_PRICE й косили вартість.
//   2) пре-ран естиматор (Phase 4) — прикидка ДО запуску.
// Ціни OpenAI звірені з лейблами TEXT_MODELS (config.ts), Anthropic — з офіційних rate-карт,
// Gemini — з ai.google.dev/gemini-api/docs/pricing (діапазон ≤200K промпту). Це чистий модуль
// (пакет імпортує і web) — жодного process.env.
export interface TokenPrice {
  inputPer1M: number;
  outputPer1M: number;
}

export const TEXT_MODEL_PRICING: Record<string, TokenPrice> = {
  // OpenAI (ті самі числа, що в лейблах TEXT_MODELS — тримати синхронно)
  "gpt-5.2": { inputPer1M: 1.75, outputPer1M: 14 },
  "gpt-5.2-pro": { inputPer1M: 21, outputPer1M: 168 },
  "gpt-5.1": { inputPer1M: 1.25, outputPer1M: 10 },
  "gpt-5": { inputPer1M: 1.25, outputPer1M: 10 },
  "gpt-5-pro": { inputPer1M: 15, outputPer1M: 120 },
  "gpt-5-mini": { inputPer1M: 0.25, outputPer1M: 2 },
  "gpt-5-nano": { inputPer1M: 0.05, outputPer1M: 0.4 },
  "gpt-4.1": { inputPer1M: 2, outputPer1M: 8 },
  "gpt-4.1-mini": { inputPer1M: 0.4, outputPer1M: 1.6 },
  "gpt-4.1-nano": { inputPer1M: 0.1, outputPer1M: 0.4 },
  "gpt-4o": { inputPer1M: 2.5, outputPer1M: 10 },
  "gpt-4o-mini": { inputPer1M: 0.15, outputPer1M: 0.6 },
  "o4-mini": { inputPer1M: 1.1, outputPer1M: 4.4 },
  // Anthropic (Claude first-party rate-карти)
  "claude-opus-4-8": { inputPer1M: 5, outputPer1M: 25 },
  "claude-sonnet-5": { inputPer1M: 3, outputPer1M: 15 },
  "claude-haiku-4-5-20251001": { inputPer1M: 1, outputPer1M: 5 },
  // Google Gemini (≤200K промпту; понад — дорожче, для естимації ігноруємо)
  "gemini-2.5-pro": { inputPer1M: 1.25, outputPer1M: 10 },
  "gemini-2.5-flash": { inputPer1M: 0.3, outputPer1M: 2.5 },
  "gemini-2.0-flash": { inputPer1M: 0.1, outputPer1M: 0.4 },
  // Legacy — лишається, щоб стара телеметрія (cost.ts) на цих моделях не падала у DEFAULT.
  "claude-3-5-sonnet-latest": { inputPer1M: 3, outputPer1M: 15 },
  "claude-3-5-haiku-latest": { inputPer1M: 0.8, outputPer1M: 4 },
};

// Фолбек для моделі поза таблицею — консервативний, щоб вартість не була 0 і не занижувалась.
export const DEFAULT_TEXT_PRICE: TokenPrice = { inputPer1M: 1, outputPer1M: 3 };

// Зображення — фіксована ціна за ОДНУ картинку (центи): image API usage_metadata не віддає.
export const IMAGE_MODEL_PRICE_CENTS: Record<string, number> = {
  "gpt-image-1": 4,
  "dall-e-3": 4,
  "dall-e-2": 2,
};
export const DEFAULT_IMAGE_PRICE_CENTS = 4;

export function textModelPrice(modelId: string): TokenPrice {
  return TEXT_MODEL_PRICING[modelId] ?? DEFAULT_TEXT_PRICE;
}

export function imageModelPriceCents(modelId: string): number {
  return IMAGE_MODEL_PRICE_CENTS[modelId] ?? DEFAULT_IMAGE_PRICE_CENTS;
}
