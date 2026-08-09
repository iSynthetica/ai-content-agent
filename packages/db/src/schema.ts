import {
  pgTable,
  pgEnum,
  uuid,
  text,
  jsonb,
  integer,
  timestamp,
  date,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

// ── enums ──────────────────────────────────────────────────────────────────
export const roleEnum = pgEnum("role", ["owner", "admin", "editor", "reviewer", "viewer"]);
export const runStatusEnum = pgEnum("run_status", [
  "queued", "running", "needs_review", "approved", "rejected", "failed",
]);
export const itemStatusEnum = pgEnum("item_status", [
  "draft", "approved", "rejected", "needs_revision",
]);
export const channelEnum = pgEnum("channel", ["linkedin", "twitter", "instagram", "blog"]);
export const planEntryStatusEnum = pgEnum("plan_entry_status", [
  "proposed", "approved", "scheduled", "generating", "generated", "skipped",
]);
export const runTriggerEnum = pgEnum("run_trigger", ["manual", "scheduled"]);
export const entrySourceEnum = pgEnum("entry_source", ["ai_suggested", "user_defined"]);
export const inboxStatusEnum = pgEnum("inbox_status", ["open", "resolved"]);
// Джерело версії тексту поста (content_item_versions.source, §content-editing): 'generated' —
// знімок, який приніс пайплайн (Writer/revision); 'human' — людське редагування чи revert.
export const contentSourceEnum = pgEnum("content_source", ["generated", "human"]);

// Per-node прогрес пайплайна (§progress) — структурне дзеркало runProgress з @forteq/shared.
// db НЕ залежить від shared, тож форму дублюємо тут (jsonb $type). Пише worker per-node.
export type RunProgressStep = {
  node: string;
  status: "running" | "done" | "skipped" | "error";
  at: string; // ISO
};
export type RunProgressJson = {
  current: string | null; // нода, що виконується зараз, або null
  steps: RunProgressStep[]; // впорядкована історія
};

// ── тенант + доступи ─────────────────────────────────────────────────────────
export const accounts = pgTable("accounts", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// users — НЕ тенант-таблиця (нема account_id), RLS не вмикаємо: auth-middleware читає її до контексту
export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const memberships = pgTable(
  "memberships",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    accountId: uuid("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    role: roleEnum("role").notNull().default("owner"),
  },
  (t) => ({
    accountUserUq: uniqueIndex("memberships_account_user_uq").on(t.accountId, t.userId),
    userIdx: index("memberships_user_idx").on(t.userId),
  }),
);

// ── компанія + налаштування ──────────────────────────────────────────────────
export const companies = pgTable(
  "companies",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    accountId: uuid("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    positioning: text("positioning"),
    websiteUrl: text("website_url"),
    description: text("description"),
    stack: jsonb("stack").$type<string[]>().default([]).notNull(),
    services: jsonb("services").$type<string[]>().default([]).notNull(),
    audience: text("audience"),
    // Стан AI-bootstrap (§6 раунд 2). NULL = ніколи не запускався. Без цієї колонки статус
    // доводилось деривувати з заповненості полів, і «не запускали», «працює» та «впало»
    // виглядали однаково — візард не міг показати ні прогрес, ні помилку.
    bootstrapStatus: text("bootstrap_status"), // pending | running | done | failed
    bootstrapError: text("bootstrap_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({ accountIdx: index("companies_account_idx").on(t.accountId) }),
);

// BYOK — ключі провайдерів на рівні АКАУНТА (не компанії): один ключ на (account, provider)
// оплачує генерацію всього акаунта. Зберігаємо лише шифротекст (AES-256-GCM, iv|tag|ct у base64) —
// plaintext ключа не лежить у БД ніколи; last4 — тільки для маскованого показу в UI. Розшифровує
// воркер на момент виконання за accountId (ключ НЕ їде у снапшот прогону — ADR-0016).
export const apiKeys = pgTable(
  "api_keys",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    accountId: uuid("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(), // openai | anthropic | tavily
    ciphertext: text("ciphertext").notNull(), // base64(iv | authTag | ciphertext)
    last4: text("last4").notNull(),
    label: text("label"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  },
  (t) => ({
    accountProviderUq: uniqueIndex("api_keys_account_provider_uq").on(t.accountId, t.provider),
  }),
);

export const companySettings = pgTable("company_settings", {
  companyId: uuid("company_id").primaryKey().references(() => companies.id, { onDelete: "cascade" }),
  accountId: uuid("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
  toneOfVoice: text("tone_of_voice"),
  toneExamples: jsonb("tone_examples").$type<string[]>().default([]).notNull(),
  visualStyle: text("visual_style"),
  forbiddenPhrases: jsonb("forbidden_phrases").$type<string[]>().default([]).notNull(),
  language: text("language").default("en").notNull(), // мова генерації; дефолт — англійська
  provider: text("provider").default("openai").notNull(), // фолбек-провайдер (легасі + не-override слоти)
  models: jsonb("models").$type<Record<string, string>>(), // фолбек per-slot id
  // Per-slot override provider+model (§ADR-0017). NULL = легасі-режим (один provider на компанію).
  // Адитивно: наявні рядки лишаються з provider+models, нове поле не потребує backfill.
  agentModels: jsonb("agent_models").$type<Record<string, { provider: string; model: string }>>(),
});

export const contentPlans = pgTable(
  "content_plans",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    accountId: uuid("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    name: text("name").default("default").notNull(),
    channelCounts: jsonb("channel_counts")
      .$type<Record<string, number>>()
      .default({ linkedin: 5, twitter: 5, instagram: 5, blog: 1 })
      .notNull(),
    config: jsonb("config").$type<Record<string, unknown>>(),
  },
  (t) => ({ companyIdx: index("content_plans_company_idx").on(t.companyId) }),
);

// датовані слоти планувальника (§5 контексту)
export const planEntries = pgTable(
  "plan_entries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    accountId: uuid("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    contentPlanId: uuid("content_plan_id").notNull().references(() => contentPlans.id, { onDelete: "cascade" }),
    date: date("date"),
    channel: channelEnum("channel").notNull(),
    topic: text("topic"),
    keyMessage: text("key_message"),
    seoKeywords: jsonb("seo_keywords").$type<string[]>().default([]).notNull(),
    pillar: text("pillar"),
    source: entrySourceEnum("source").default("ai_suggested").notNull(),
    status: planEntryStatusEnum("status").default("proposed").notNull(),
    runId: uuid("run_id"),
    contentItemId: uuid("content_item_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({ companyDateIdx: index("plan_entries_company_date_idx").on(t.companyId, t.date) }),
);

// ── прогони + результати ─────────────────────────────────────────────────────
export const generationRuns = pgTable(
  "generation_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    accountId: uuid("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    status: runStatusEnum("status").default("queued").notNull(),
    trigger: runTriggerEnum("trigger").default("manual").notNull(),
    scheduledFor: timestamp("scheduled_for", { withTimezone: true }),
    modelConfig: jsonb("model_config").$type<Record<string, unknown>>(),
    // Повна конфігурація прогону для показу на сторінці (§spec 08): канали/лічильники/кут/моделі.
    // Nullable: null для старих прогонів і для запусків до цієї фічі. Адитивно, без backfill.
    runConfig: jsonb("run_config").$type<Record<string, unknown>>(),
    costCents: integer("cost_cents").default(0).notNull(),
    threadId: text("langgraph_thread_id"),
    // Per-node прогрес пайплайна (§progress). Nullable: null до першого кроку / для старих прогонів.
    progress: jsonb("progress").$type<RunProgressJson>(),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    // archivedAt — м'яке архівування ЦІЛОГО прогону (§run-archive). Nullable-таймстемп, а НЕ статус:
    // архів ортогональний до run_status (queued/needs_review/…), тож прогін зберігає свій статус і в
    // архіві. null = активний; not-null = в архіві (ховаємо зі списку прогонів компанії). Hard-delete
    // дозволений лише ПІСЛЯ архівації (service-гвард); каскад по FK знищить content_items/публікації/версії.
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (t) => ({ companyIdx: index("generation_runs_company_idx").on(t.companyId, t.createdAt) }),
);

// ІНВАРІАНТ id: contentItems.id задається ЯВНО (= planItem-derived, spike-1 §7.3),
// тому БЕЗ defaultRandom — це робить upsert ідемпотентним на retry черги.
export const contentItems = pgTable(
  "content_items",
  {
    id: uuid("id").primaryKey(),
    accountId: uuid("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    runId: uuid("run_id").notNull().references(() => generationRuns.id, { onDelete: "cascade" }),
    channel: channelEnum("channel").notNull(),
    topic: text("topic"),
    // title — заголовок поста (людське редагування, §content-editing). Nullable: пайплайн його не
    // генерує (topic лишається робочою темою для UI/експорту), title з'являється лише коли редактор
    // явно його задав через PATCH; порожній = використовуємо topic як заголовок у рендері.
    title: text("title"),
    text: text("text"),
    scores: jsonb("scores").$type<Record<string, unknown>>(),
    violations: jsonb("violations").$type<unknown[]>(),
    imageUrl: text("image_url"),
    status: itemStatusEnum("status").default("draft").notNull(),
    version: integer("version").default(1).notNull(),
    revisionHistory: jsonb("revision_history").$type<string[]>().default([]).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({ runIdx: index("content_items_run_idx").on(t.runId) }),
);

// Історія версій тексту поста (§content-editing): кожен запис — незмінний знімок тексту/заголовка
// на момент persist (source='generated') або людської правки/revert (source='human'). Append-only —
// навіть revert ДОДАЄ новий запис, а не видаляє історію (§ спека: "revert is a forward action").
// Початкова згенерована версія пишеться воркером одразу після upsertContentItems (щоб
// "згенерований текст" завжди можна було відновити, навіть якщо його ще ніхто не редагував).
export const contentItemVersions = pgTable(
  "content_item_versions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    contentItemId: uuid("content_item_id")
      .notNull()
      .references(() => contentItems.id, { onDelete: "cascade" }),
    accountId: uuid("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
    source: contentSourceEnum("source").notNull(),
    text: text("text").notNull(),
    title: text("title"),
    editorUserId: uuid("editor_user_id").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    itemCreatedIdx: index("content_item_versions_item_created_idx").on(t.contentItemId, t.createdAt),
  }),
);

// ── AI-підбір тем для ad-hoc прогону (topic preview) ──────────────────────────
// Короткоживучі scratch-рядки: запит на пропозицію тем (input) + результат (topics), поки людина
// не погодить їх і не запустить прогін через звичайний createRun.topics. Немає runId/planEntryId —
// чернетка НЕ прив'язана до жодного вже існуючого рядка, вона сама лише вхід для наступного прогону.
// v1: без cleanup job — чернетки не видаляються самі (малий обсяг, TTL — шов на майбутнє).
export const runTopicDrafts = pgTable(
  "run_topic_drafts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    accountId: uuid("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    status: text("status").default("pending").notNull(), // pending | ready | failed
    // Запит: { channels: Channel[], counts: Record<Channel, number>, angle?: string }.
    input: jsonb("input").$type<Record<string, unknown>>().notNull(),
    // Результат: RunTopicInput[] (@forteq/shared) — null, доки status не 'ready'.
    topics: jsonb("topics").$type<
      Array<{ channel: string; topic: string; keyMessage?: string; seoKeywords?: string[] }>
    >(),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({ accountIdx: index("run_topic_drafts_account_idx").on(t.accountId) }),
);

// ── run-config пресети (§Phase 5): названа конфігурація прогону для переюзу ────
// Зберігає підмножину run-config (канали/лічильники/моделі/акцент), яку людина застосовує в
// діалозі замість ручного налаштування щоразу. Per-company, тенант-ізоляція за account_id (RLS).
export const runConfigPresets = pgTable(
  "run_config_presets",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    accountId: uuid("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    // { channels?: Channel[]; counts?: Record<Channel,number>; agentModels?: ...; angle?: string }.
    config: jsonb("config").$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    // Ім'я унікальне в межах компанії — без двох пресетів з однаковою назвою.
    companyNameIdx: uniqueIndex("run_config_presets_company_name_idx").on(t.companyId, t.name),
  }),
);

// ── нотифікації + інбокс (§8 контексту) ──────────────────────────────────────
export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    accountId: uuid("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }), // null = акаунт-широко
    type: text("type").notNull(),
    title: text("title").notNull(),
    body: text("body"),
    data: jsonb("data").$type<Record<string, unknown>>(),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({ feedIdx: index("notifications_account_user_idx").on(t.accountId, t.userId, t.readAt) }),
);

export const inboxItems = pgTable(
  "inbox_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    accountId: uuid("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
    companyId: uuid("company_id").references(() => companies.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    title: text("title").notNull(),
    entityType: text("entity_type"),
    entityId: uuid("entity_id"),
    status: inboxStatusEnum("status").default("open").notNull(),
    assigneeId: uuid("assignee_id").references(() => users.id),
    data: jsonb("data").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolvedBy: uuid("resolved_by").references(() => users.id),
  },
  (t) => ({ statusIdx: index("inbox_items_account_status_idx").on(t.accountId, t.status) }),
);

// ── публікації + конекти сервісів (§publishing foundation §2) ─────────────────
// OAuth-токени сервісів (LinkedIn/X/Instagram) + конфіг Telegram-бота. Клонує BYOK-підхід api_keys:
// у БД лежить лише шифротекст (*_ct = AES-256-GCM base64), plaintext токена не зберігаємо ніколи;
// розшифровує воркер на момент виконання (crypto.ts encrypt/decryptSecret). provider — PLAIN TEXT,
// не pg-enum (як api_keys.provider), щоб додавання провайдера не тягло міграцію enum. UNIQUE(account,
// provider): один конект на провайдера в межах орендаря (MVP). Тенант-ізоляція за account_id (RLS).
export const serviceConnections = pgTable(
  "service_connections",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    accountId: uuid("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(), // linkedin | twitter | instagram | telegram
    status: text("status").default("connected").notNull(), // connected | expired | error | disconnected
    accessTokenCt: text("access_token_ct"), // base64(iv|tag|ct); nullable для telegram (лише bot-token)
    refreshTokenCt: text("refresh_token_ct"), // nullable (X/LinkedIn refresh; IG long-lived без refresh)
    // BYO-app (§byo-oauth-app-creds): OAuth-креди застосунку самого орендаря (дзеркалить BYOK-ключі
    // моделей). app_client_id — НЕ секрет (безпечно показати в UI, щоб було видно, який застосунок
    // підключено); app_client_secret_ct — шифротекст (AES-256-GCM, як *_ct токенів). Обидва nullable:
    // за їх відсутності OAuth-флоу падає на платформенні env-креди (тихий fallback). Telegram їх не має.
    appClientId: text("app_client_id"),
    appClientSecretCt: text("app_client_secret_ct"),
    externalAccountId: text("external_account_id"), // URN / user id / page id / chat id
    externalAccountName: text("external_account_name"), // напр. "Acme Corp on LinkedIn"
    scopes: text("scopes"), // надані scope через пробіл/кому
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    meta: jsonb("meta").$type<Record<string, unknown>>().default({}).notNull(), // напр. IG business id, LinkedIn org URN
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  },
  (t) => ({
    accountProviderUq: uniqueIndex("service_connections_account_provider_uq").on(
      t.accountId,
      t.provider,
    ),
  }),
);

// Кожна спроба публікації content_item у провайдера. Слугує idempotency-ключем воркера: UNIQUE(item,
// provider) означає одну живу публікацію на пару, тож повторний запуск джоби не дублює пост. run_id —
// щоб UI тягнув статуси публікацій per-run поряд з елементами. Тенант-ізоляція за account_id (RLS);
// repo-методи беруть accountId першим аргументом (defense-in-depth поверх RLS).
export const publications = pgTable(
  "publications",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    accountId: uuid("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
    contentItemId: uuid("content_item_id")
      .notNull()
      .references(() => contentItems.id, { onDelete: "cascade" }),
    runId: uuid("run_id").notNull().references(() => generationRuns.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    status: text("status").default("pending").notNull(), // pending | published | failed
    externalPostId: text("external_post_id"),
    externalUrl: text("external_url"),
    error: text("error"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    itemProviderUq: uniqueIndex("publications_content_item_provider_uq").on(
      t.contentItemId,
      t.provider,
    ),
  }),
);
