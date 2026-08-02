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
  language: text("language").default("uk").notNull(),
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
