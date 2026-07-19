// Чисті константи (без process.env — цей пакет імпортує і web).
export const CHANNELS = ["linkedin", "twitter", "instagram", "blog"] as const;
export type Channel = (typeof CHANNELS)[number];

export const CHANNEL_DEFAULTS: Record<Channel, number> = {
  linkedin: 5,
  twitter: 5,
  instagram: 5,
  blog: 1,
};

export const MAX_REVISIONS = 3;

export const RUN_STATUSES = [
  "queued", "running", "needs_review", "approved", "rejected", "failed",
] as const;
export const ITEM_STATUSES = ["draft", "approved", "rejected", "needs_revision"] as const;
export const PLAN_ENTRY_STATUSES = [
  "proposed", "approved", "scheduled", "generating", "generated", "skipped",
] as const;
export const ROLES = ["owner", "admin", "editor", "reviewer", "viewer"] as const;
export const WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

// ── Каталог моделей для селектора в налаштуваннях ─────────────────────────────
// ID звірено з реальним прайсом користувача (2026-07). Ціни в лейблах: input/output за 1M токенів.
// provider обирає набір ТЕКСТОВИХ моделей; зображення — завжди OpenAI (Anthropic їх не робить).
export const PROVIDERS = ["openai", "anthropic"] as const;
export type Provider = (typeof PROVIDERS)[number];

// Текстові агенти, для яких обирається модель.
export const AGENT_MODEL_KEYS = ["researcher", "strategist", "writer", "reviewer", "judge"] as const;
export type AgentModelKey = (typeof AGENT_MODEL_KEYS)[number];
export const AGENT_MODEL_LABELS: Record<AgentModelKey, string> = {
  researcher: "Дослідник",
  strategist: "Стратег",
  writer: "Автор",
  reviewer: "Рецензент",
  judge: "Суддя (evaluation)",
};

export interface ModelOption {
  id: string;
  label: string;
}

export const TEXT_MODELS: Record<Provider, ModelOption[]> = {
  openai: [
    { id: "gpt-5.2", label: "GPT-5.2 — флагман · $1.75/$14" },
    { id: "gpt-5.2-pro", label: "GPT-5.2 Pro — reasoning · $21/$168" },
    { id: "gpt-5.1", label: "GPT-5.1 · $1.25/$10" },
    { id: "gpt-5", label: "GPT-5 · $1.25/$10" },
    { id: "gpt-5-pro", label: "GPT-5 Pro — reasoning · $15/$120" },
    { id: "gpt-5-mini", label: "GPT-5 mini — збалансований · $0.25/$2" },
    { id: "gpt-5-nano", label: "GPT-5 nano — найдешевший · $0.05/$0.40" },
    { id: "gpt-4.1", label: "GPT-4.1 · $2/$8" },
    { id: "gpt-4.1-mini", label: "GPT-4.1 mini · $0.40/$1.60" },
    { id: "gpt-4.1-nano", label: "GPT-4.1 nano · $0.10/$0.40" },
    { id: "gpt-4o", label: "GPT-4o · $2.50/$10" },
    { id: "gpt-4o-mini", label: "GPT-4o mini · $0.15/$0.60" },
    { id: "o4-mini", label: "o4-mini — reasoning · $1.10/$4.40" },
  ],
  anthropic: [
    { id: "claude-opus-4-8", label: "Claude Opus 4.8 — флагман" },
    { id: "claude-sonnet-5", label: "Claude Sonnet 5 — збалансований" },
    { id: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5 — швидкий" },
  ],
};

// Зображення (Visual-агент) — лише OpenAI.
export const IMAGE_MODELS: ModelOption[] = [{ id: "gpt-image-1", label: "GPT Image 1" }];

// Розумні дефолти per-agent (трейдоф T2: дешевша для ресерчу/планування, сильніша для Writer/Reviewer/Judge).
export const DEFAULT_MODELS_BY_PROVIDER: Record<Provider, Record<string, string>> = {
  openai: {
    // Дефолт — gpt-5-nano (найдешевша, $0.05/$0.40) для всіх текстових агентів; користувач
    // за бажанням піднімає окремі (напр. Writer/Reviewer) сильнішими в селекторі налаштувань.
    researcher: "gpt-5-nano",
    strategist: "gpt-5-nano",
    writer: "gpt-5-nano",
    reviewer: "gpt-5-nano",
    judge: "gpt-5-nano",
    visual: "gpt-image-1",
  },
  anthropic: {
    researcher: "claude-haiku-4-5-20251001",
    strategist: "claude-sonnet-5",
    writer: "claude-opus-4-8",
    reviewer: "claude-sonnet-5",
    judge: "claude-opus-4-8",
    visual: "gpt-image-1",
  },
};
