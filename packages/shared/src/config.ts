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

// Медіа (зображення постів). ЄДИНЕ джерело URL-конвенції для двох апок, які інакше розійшлися б:
// worker пише content_items.image_url цим шляхом, а api парсить із нього ключ. Шлях свідомо
// через web-BFF (/api) → api (/v1/media): api назовні не публікується, браузер б'є same-origin
// у web, а той проксує (див. web/lib/endpoints.ts ALLOW + web/server/proxy.ts).
// Ключ = `${runId}/${draftId}.${ext}` — рівно два сегменти (див. ImageStore у worker composition).
export const MEDIA_PATH_PREFIX = "/api/media";
export function mediaUrl(key: string): string {
  return `${MEDIA_PATH_PREFIX}/${key}`;
}

export const RUN_STATUSES = [
  "queued", "running", "needs_review", "approved", "rejected", "failed",
] as const;
export const ITEM_STATUSES = ["draft", "approved", "rejected", "needs_revision"] as const;
// Джерело версії тексту поста (content_item_versions.source, §content-editing).
export const CONTENT_VERSION_SOURCES = ["generated", "human"] as const;
export const PLAN_ENTRY_STATUSES = [
  "proposed", "approved", "scheduled", "generating", "generated", "skipped",
] as const;
export const ROLES = ["owner", "admin", "editor", "reviewer", "viewer"] as const;
export const WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

// Мова ГЕНЕРАЦІЇ контенту (окремо від мови UI). Зберігається кодом; іде у промпти як {language}.
// Дефолт — англійська. Коди сумісні з наявними даними ("uk"/"en"), тож без міграції значень.
export const DEFAULT_GENERATION_LANGUAGE = "en";
export const GENERATION_LANGUAGES: ReadonlyArray<{ code: string; label: string }> = [
  { code: "en", label: "English" },
  { code: "uk", label: "Ukrainian (Українська)" },
  { code: "es", label: "Spanish (Español)" },
  { code: "de", label: "German (Deutsch)" },
  { code: "fr", label: "French (Français)" },
  { code: "pt", label: "Portuguese (Português)" },
  { code: "it", label: "Italian (Italiano)" },
  { code: "pl", label: "Polish (Polski)" },
  { code: "nl", label: "Dutch (Nederlands)" },
  { code: "tr", label: "Turkish (Türkçe)" },
  { code: "ja", label: "Japanese (日本語)" },
  { code: "zh", label: "Chinese (中文)" },
  { code: "ar", label: "Arabic (العربية)" },
];

// ── Каталог моделей для селектора в налаштуваннях ─────────────────────────────
// ID звірено з реальним прайсом користувача (2026-07). Ціни в лейблах: input/output за 1M токенів.
// provider обирає набір ТЕКСТОВИХ моделей; зображення — завжди OpenAI (Anthropic їх не робить).
export const PROVIDERS = ["openai", "anthropic", "gemini"] as const;
export type Provider = (typeof PROVIDERS)[number];

// Людські назви провайдерів — єдине джерело для селекторів UI (щоб новий провайдер не показувався
// під чужим лейблом через захардкоджений тернар).
export const PROVIDER_LABELS: Record<Provider, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  gemini: "Google Gemini",
};

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
    { id: "gpt-5.2", label: "GPT-5.2 — flagship · $1.75/$14" },
    { id: "gpt-5.2-pro", label: "GPT-5.2 Pro — reasoning · $21/$168" },
    { id: "gpt-5.1", label: "GPT-5.1 · $1.25/$10" },
    { id: "gpt-5", label: "GPT-5 · $1.25/$10" },
    { id: "gpt-5-pro", label: "GPT-5 Pro — reasoning · $15/$120" },
    { id: "gpt-5-mini", label: "GPT-5 mini — balanced · $0.25/$2" },
    { id: "gpt-5-nano", label: "GPT-5 nano — cheapest · $0.05/$0.40" },
    { id: "gpt-4.1", label: "GPT-4.1 · $2/$8" },
    { id: "gpt-4.1-mini", label: "GPT-4.1 mini · $0.40/$1.60" },
    { id: "gpt-4.1-nano", label: "GPT-4.1 nano · $0.10/$0.40" },
    { id: "gpt-4o", label: "GPT-4o · $2.50/$10" },
    { id: "gpt-4o-mini", label: "GPT-4o mini · $0.15/$0.60" },
    { id: "o4-mini", label: "o4-mini — reasoning · $1.10/$4.40" },
  ],
  anthropic: [
    { id: "claude-opus-4-8", label: "Claude Opus 4.8 — flagship" },
    { id: "claude-sonnet-5", label: "Claude Sonnet 5 — balanced" },
    { id: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5 — fast" },
  ],
  gemini: [
    { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro — flagship" },
    { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash — balanced" },
    { id: "gemini-2.0-flash", label: "Gemini 2.0 Flash — fast/cheap" },
  ],
};

// Зображення (Visual-агент) — лише OpenAI.
export const IMAGE_MODELS: ModelOption[] = [{ id: "gpt-image-1", label: "GPT Image 1" }];

// ── Пряма публікація в соцмережі + Telegram-нотифікації (§publishing foundation) ──
// PUBLISH_PROVIDERS — куди МОЖНА опублікувати згенерований пост (повний OAuth-адаптер). blog таргета
// не має; його channel не мапиться сюди. Publish мапить channel → однойменний provider.
export const PUBLISH_PROVIDERS = ["linkedin", "twitter", "instagram"] as const;
export type PublishProvider = (typeof PUBLISH_PROVIDERS)[number];

// CONNECTION_PROVIDERS — усі провайдери, для яких орендар тримає "connection" (токени/конфіг у
// service_connections). telegram — теж connection (bot token + chat id), але НЕ публікатор, тож його
// нема у PUBLISH_PROVIDERS: він шле нотифікацію "контент готовий до рецензії", а не публікує пост.
export const CONNECTION_PROVIDERS = ["linkedin", "twitter", "instagram", "telegram"] as const;
export type ConnectionProvider = (typeof CONNECTION_PROVIDERS)[number];

// Стан connection у UI: connected — активна; expired — токен протух (reconnect/refresh); error —
// остання дія впала; disconnected — явно відключено (шов; MVP просто видаляє рядок).
export const CONNECTION_STATUSES = ["connected", "expired", "error", "disconnected"] as const;
export type ConnectionStatus = (typeof CONNECTION_STATUSES)[number];

// Стан однієї спроби публікації (publications.status): pending → в черзі/виконується; published →
// успіх (є externalUrl); failed → помилка (є error).
export const PUBLICATION_STATUSES = ["pending", "published", "failed"] as const;
export type PublicationStatus = (typeof PUBLICATION_STATUSES)[number];

// Людські назви провайдерів-connection'ів — єдине джерело для карток UI (щоб новий провайдер не
// показувався під захардкодженим лейблом). Дзеркалить PROVIDER_LABELS для BYOK.
export const CONNECTION_PROVIDER_LABELS: Record<ConnectionProvider, string> = {
  linkedin: "LinkedIn",
  twitter: "X (Twitter)",
  instagram: "Instagram",
  telegram: "Telegram",
};

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
  gemini: {
    // Зображення завжди OpenAI (Gemini генерацію gpt-image-1 не робить) — visual лишається gpt-image-1.
    researcher: "gemini-2.0-flash",
    strategist: "gemini-2.5-flash",
    writer: "gemini-2.5-pro",
    reviewer: "gemini-2.5-flash",
    judge: "gemini-2.5-pro",
    visual: "gpt-image-1",
  },
};
