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

// Провайдери текстових моделей. Зображення — завжди OpenAI (gpt-image-1), незалежно від цього.
export type ModelProvider = "openai" | "anthropic" | "gemini";

// Per-slot вибір провайдера+моделі (§ADR-0017). Дозволяє researcher на Gemini, writer на Claude тощо.
export interface SlotModel {
  provider: ModelProvider;
  model: string;
}

// Резолвлений снапшот моделей на момент запуску (кладеться у стан → персиститься у checkpointer).
//
// Адитивність заради checkpointer-сумісності (§ADR-0017): `provider`+`models` лишаються ФОЛБЕКОМ і
// формою, яку несуть уже наявні (in-flight) стани; `agentModels` — НЕОБОВʼЯЗКОВЕ per-slot
// перевизначення. Старий резолвлений конфіг (без agentModels) читається без змін — resume не ламається.
export interface ModelConfig {
  provider: ModelProvider; // фолбек-провайдер для слотів без override
  models: Record<ModelSlot, string>; // фолбек per-slot id
  agentModels?: Partial<Record<ModelSlot, SlotModel>>; // per-slot override provider+model
}

// Резолв провайдера/моделі для слота: override виграє, інакше — фолбек.
export function slotModel(config: ModelConfig, slot: ModelSlot): SlotModel {
  const o = config.agentModels?.[slot];
  return { provider: o?.provider ?? config.provider, model: o?.model ?? config.models[slot] };
}

// Текстові провайдери, задіяні у прогоні (для BYOK-union: прогону потрібні ключі УСІХ них).
// visual виключено — зображення завжди OpenAI, його ключ вимагається окремо у visuals-джобі.
export function textProvidersUsed(config: ModelConfig): ModelProvider[] {
  const slots: ModelSlot[] = ["researcher", "strategist", "writer", "reviewer", "judge"];
  return [...new Set(slots.map((s) => slotModel(config, s).provider))];
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
    // per-slot override передаємо як є; undefined = легасі-режим (лише фолбек-провайдер).
    agentModels: snapshot?.agentModels,
  };
}

// Секрети, потрібні defaultModelFactory у worker. Тут — лише тип-контракт (пайплайн їх не читає).
// Зображення завжди OpenAI, тож openaiApiKey потрібен для visual навіть коли текст на іншому провайдері.
export interface ModelSecrets {
  openaiApiKey?: string;
  anthropicApiKey?: string;
  geminiApiKey?: string;
}
