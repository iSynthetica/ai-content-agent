// Доменні інтерфейси репозиторіїв (spike-2 §2.2, §4.2). Репозиторій — ЄДИНА точка доступу до
// Drizzle/Postgres. Кожен тримає request-scoped tx (НЕ синглтон, §2.1/§2.10) і приймає accountId
// як другий шар скоупу поверх RLS. Метод БЕЗ accountId фізично відсутній — крос-акаунт неможливий.
import type { z } from "zod";
import type {
  accountDTO,
  companyDTO,
  runDTO,
  contentItemDTO,
  updateSettingsRequest,
  runStatusSchema,
  itemStatusSchema,
  channelSchema,
  planEntryStatusSchema,
} from "@forteq/shared";
import type { DbExecutor, AuthCtx, Paged, PageParams } from "../di/types";

export type { DbExecutor, AuthCtx, Paged, PageParams };

// ── доменні типи (виведені з контрактів межі + локальні для сутностей без DTO) ────
// Account (switcher) — { id, name, role }. role — доменний enum-рядок; на межі звужується до
// roleSchema. Читається за членством user (RLS accounts_member_read), не за accountId.
export type Account = z.infer<typeof accountDTO>;
export type Company = z.infer<typeof companyDTO>;
export type RunSummary = z.infer<typeof runDTO>;
export type ContentItem = z.infer<typeof contentItemDTO>;
export type SettingsPatch = z.infer<typeof updateSettingsRequest>;
export type RunStatus = z.infer<typeof runStatusSchema>;
export type ItemStatus = z.infer<typeof itemStatusSchema>;
export type Channel = z.infer<typeof channelSchema>;
export type PlanEntryStatus = z.infer<typeof planEntryStatusSchema>;

// company_settings / content_plans не мають окремого response-DTO у @forteq/shared —
// мапимо рядок у ці локальні форми (шов web↔api лишається на request/response-схемах).
export interface CompanySettings {
  companyId: string;
  toneOfVoice: string | null;
  toneExamples: string[];
  visualStyle: string | null;
  forbiddenPhrases: string[];
  language: string;
  provider: string;
  models: Record<string, string> | null;
  agentModels: Record<string, { provider: string; model: string }> | null;
}
export interface ContentPlan {
  id: string;
  companyId: string;
  name: string;
  channelCounts: Record<string, number>;
  config: Record<string, unknown> | null;
}

// ── input-типи ───────────────────────────────────────────────────────────────
export interface NewCompany {
  name: string;
  positioning?: string | null;
  websiteUrl?: string | null;
  description?: string | null;
  stack?: string[];
  services?: string[];
  audience?: string | null;
}
export type CompanyPatch = Partial<NewCompany>;

export interface NewContentPlan {
  name?: string;
  channelCounts?: Record<string, number>;
  config?: Record<string, unknown> | null;
}
export interface ContentPlanPatch {
  name?: string;
  channelCounts?: Record<string, number>;
  config?: Record<string, unknown> | null;
}

export interface NewRun {
  accountId: string;
  companyId: string;
  status: RunStatus;
  trigger: "manual" | "scheduled";
  scheduledFor: Date | null;
  modelConfig: Record<string, unknown>;
  runConfig?: Record<string, unknown> | null;
  threadId: string;
  createdBy: string | null;
}
export interface RunListFilter {
  status?: RunStatus;
  from?: string; // ISO datetime
  to?: string; // ISO datetime
  page: number;
  pageSize: number;
}
export interface ItemsQuery {
  channel?: Channel;
}

// ── інтерфейси репозиторіїв ──────────────────────────────────────────────────
// Читання за членством user (RLS accounts_member_read/memberships_read_own) — ключ на
// app.current_user_id, тож повертає УСІ акаунти user, не лише активний (§2.8.3).
export interface AccountsRepo {
  listByUser(userId: string): Promise<Account[]>;
  isMember(userId: string, accountId: string): Promise<boolean>;
}

// Стан AI-bootstrap. Окремо від Company DTO: це стан фонової задачі, а не властивість компанії,
// і тягнути його у кожну відповідь про компанію означало б додавати шум усім споживачам.
export interface BootstrapState {
  status: string | null;
  error: string | null;
}

export interface CompaniesRepo {
  create(accountId: string, data: NewCompany): Promise<Company>;
  getBootstrapState(accountId: string, companyId: string): Promise<BootstrapState | null>;
  findById(accountId: string, id: string): Promise<Company | null>;
  list(accountId: string, page: PageParams): Promise<Paged<Company>>;
  // Компанії акаунта без пагінації (company switcher) — { items } на межі.
  listByAccount(accountId: string): Promise<Company[]>;
  update(accountId: string, id: string, patch: CompanyPatch): Promise<Company | null>;
  delete(accountId: string, id: string): Promise<boolean>;
}

export interface SettingsRepo {
  getByCompany(accountId: string, companyId: string): Promise<CompanySettings | null>;
  upsert(accountId: string, companyId: string, patch: SettingsPatch): Promise<CompanySettings>;
}

// ── BYOK: ключі провайдерів (§ADR-0016) ───────────────────────────────────────
// Маскована форма для api/UI — БЕЗ шифротексту (repo не віддає його назовні; декрипт лише у воркері).
export interface ApiKeyMasked {
  provider: string;
  last4: string;
  label: string | null;
  createdAt: string;
  updatedAt: string;
  lastUsedAt: string | null;
}
export interface NewApiKey {
  provider: string;
  ciphertext: string;
  last4: string;
  label?: string | null;
}
export interface ApiKeysRepo {
  list(accountId: string): Promise<ApiKeyMasked[]>;
  upsert(accountId: string, data: NewApiKey): Promise<void>;
  delete(accountId: string, provider: string): Promise<boolean>;
  exists(accountId: string, provider: string): Promise<boolean>;
}

export interface ContentPlansRepo {
  getByCompany(accountId: string, companyId: string): Promise<ContentPlan | null>;
  create(accountId: string, companyId: string, data: NewContentPlan): Promise<ContentPlan>;
  updateById(accountId: string, id: string, patch: ContentPlanPatch): Promise<ContentPlan | null>;
}

// ── plan_entries (планувальник, §2.11) ────────────────────────────────────────
export interface PlanEntry {
  id: string;
  date: string | null;
  channel: Channel;
  topic: string | null;
  keyMessage: string | null;
  seoKeywords: string[];
  pillar: string | null;
  source: "ai_suggested" | "user_defined";
  status: PlanEntryStatus;
}

export interface NewPlanEntry {
  companyId: string;
  contentPlanId: string;
  date: string | null;
  channel: Channel;
  pillar?: string | null;
  source?: "ai_suggested" | "user_defined";
}

export interface PlanEntryPatch {
  topic?: string;
  keyMessage?: string;
  seoKeywords?: string[];
  pillar?: string;
  date?: string | null;
}

export interface PlanEntriesRepo {
  listByCompany(
    accountId: string,
    companyId: string,
    range?: { from?: string; to?: string },
  ): Promise<PlanEntry[]>;
  listDatedKeys(
    accountId: string,
    companyId: string,
  ): Promise<Array<{ date: string | null; channel: string }>>;
  insertMany(accountId: string, rows: NewPlanEntry[]): Promise<number>;
  findById(accountId: string, id: string): Promise<PlanEntry | null>;
  patch(accountId: string, id: string, patch: PlanEntryPatch): Promise<PlanEntry | null>;
  approve(accountId: string, ids: string[]): Promise<number>;
}

// Проєкція рядка run під HITL-рішення (§7): статус + threadId (langgraph_thread_id) для resume-job.
export interface RunDecisionRow {
  id: string;
  companyId: string;
  status: RunStatus;
  threadId: string | null;
}

export interface RunsRepo {
  create(data: NewRun): Promise<{ id: string }>;
  findById(accountId: string, id: string): Promise<RunSummary | null>;
  listByCompany(accountId: string, companyId: string, filter: RunListFilter): Promise<Paged<RunSummary>>;
  countActiveByCompany(accountId: string, companyId: string): Promise<number>;
  // HITL (§7/§7.1): читання під FOR UPDATE (compare-and-set статусу) + рух статусу прогону.
  getForDecision(accountId: string, id: string): Promise<RunDecisionRow | null>;
  updateStatus(accountId: string, id: string, status: RunStatus): Promise<void>;
}

export interface ContentItemsRepo {
  listByRun(accountId: string, runId: string, query: ItemsQuery): Promise<ContentItem[]>;
  // per-item HITL (§7): читання айтема (скоуп/DTO) + прямий workflow-статус (approve/reject/rerun).
  findById(accountId: string, id: string): Promise<ContentItem | null>;
  updateStatus(accountId: string, id: string, status: ItemStatus): Promise<ContentItem | null>;
}

// ── Нотифікації та inbox (§2.13) ─────────────────────────────────────────────
export interface NotificationRow {
  id: string;
  type: string;
  title: string;
  body: string | null;
  data: Record<string, unknown> | null;
  readAt: string | null;
  createdAt: string;
}

export interface InboxItemRow {
  id: string;
  companyId: string | null;
  type: string;
  title: string;
  entityType: string | null;
  entityId: string | null;
  status: "open" | "resolved";
  data: Record<string, unknown> | null;
  createdAt: string;
}

export interface OpenInboxRow {
  accountId: string;
  companyId?: string | null;
  type: string;
  title: string;
  entityType: string;
  entityId: string;
  assigneeId?: string | null;
  data?: Record<string, unknown> | null;
}

export interface NotificationsRepo {
  insert(row: {
    accountId: string;
    userId?: string | null;
    type: string;
    title: string;
    body?: string | null;
    data?: Record<string, unknown> | null;
  }): Promise<void>;
  list(accountId: string, userId: string, limit: number): Promise<NotificationRow[]>;
  countUnread(accountId: string, userId: string): Promise<number>;
  markRead(accountId: string, id: string): Promise<void>;
  markAllRead(accountId: string, userId: string): Promise<void>;
}

export interface InboxItemsRepo {
  findOpenByEntity(accountId: string, type: string, entityId: string): Promise<{ id: string } | null>;
  insert(row: OpenInboxRow): Promise<void>;
  listOpen(accountId: string, limit: number): Promise<InboxItemRow[]>;
  countOpen(accountId: string): Promise<number>;
  resolve(accountId: string, id: string, resolvedBy: string): Promise<boolean>;
  resolveByEntity(accountId: string, entityId: string, resolvedBy: string | null): Promise<void>;
}

// Бег репо — будується на кожен запит поверх request-scoped tx (buildRepos, §4.1).
export interface Repos {
  accounts: AccountsRepo;
  companies: CompaniesRepo;
  settings: SettingsRepo;
  apiKeys: ApiKeysRepo;
  contentPlans: ContentPlansRepo;
  planEntries: PlanEntriesRepo;
  runs: RunsRepo;
  contentItems: ContentItemsRepo;
  notifications: NotificationsRepo;
  inbox: InboxItemsRepo;
}
