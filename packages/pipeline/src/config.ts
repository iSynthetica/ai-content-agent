// Конфіг моделей пайплайна (§6 spike-1).
// Тут читаються ЛИШЕ ідентифікатори моделей (не секрети!). API-ключі резолвляться у worker
// (composition root) і заходять у пайплайн через порти — пайплайн секретів не бачить.

// Агенти, що будують LLM per-run. Image ("visual") і офлайн-суддя ("judge") — окремі слоти.
export const AGENT_NAMES = ["researcher", "strategist", "writer", "reviewer"] as const;
export type AgentName = (typeof AGENT_NAMES)[number];
export type ModelSlot = AgentName | "judge" | "visual";

// Ліміти двох різних петель ревізії (не плутати, §8 spike-1).
export const MAX_REVISIONS = 3; // авто-петля Reviewer→Writer
export const MAX_HUMAN_REVISIONS = 2; // людська петля gate→revision

// Скільки айтемів вузол обробляє ПАРАЛЕЛЬНО (mapPool). Per-item LLM-виклики незалежні,
// тож послідовність була чистою втратою часу. Межа — компроміс із rate-limit провайдера.
export const ITEM_CONCURRENCY = 4; // текстові вузли: writer, reviewer
export const IMAGE_CONCURRENCY = 2; // картинки дорожчі й жорсткіші за лімітами

// Резолвлений снапшот моделей на момент запуску (кладеться у стан → персиститься у checkpointer).
export interface ModelConfig {
  provider: "openai" | "anthropic";
  models: Record<ModelSlot, string>; // per-agent id
}

// Дефолти — фолбек, коли company_settings/env нічого не задають.
export const DEFAULT_MODELS: ModelConfig = {
  provider: "openai",
  models: {
    // Дефолт — gpt-5-nano (найдешевша) для всіх текстових агентів; сильніші обираються в налаштуваннях.
    researcher: "gpt-5-nano",
    strategist: "gpt-5-nano",
    writer: "gpt-5-nano",
    reviewer: "gpt-5-nano",
    judge: "gpt-5-nano",
    visual: "gpt-image-1",
  },
};

// ВАЖЛИВО (§0.7, §6 spike-1): пайплайн НІКОЛИ не читає process.env у module scope.
// Ідентифікатори моделей приходять як резолвлений ModelConfig у PipelineInput (снапшот запуску),
// а не з env. Резолв env→ModelConfig — робота worker (composition root), не цього пакета.

// Резолв: снапшот запуску (company_settings.models) поверх дефолтів, snapshot виграє.
export function resolveModelConfig(
  snapshot: Partial<ModelConfig> | undefined,
  defaults: ModelConfig = DEFAULT_MODELS,
): ModelConfig {
  // TODO: за потреби повний deep-merge; наразі поверхневий мердж моделей достатній.
  return {
    provider: snapshot?.provider ?? defaults.provider,
    models: { ...defaults.models, ...(snapshot?.models ?? {}) } as Record<ModelSlot, string>,
  };
}

// Секрети, потрібні defaultModelFactory у worker. Тут — лише тип-контракт (пайплайн їх не читає).
export interface ModelSecrets {
  openaiApiKey?: string;
  anthropicApiKey?: string;
}
