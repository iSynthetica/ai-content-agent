import { z } from "zod";
import {
  CHANNELS, ROLES, RUN_STATUSES, ITEM_STATUSES, PLAN_ENTRY_STATUSES, WEEKDAYS,
  CONTENT_VERSION_SOURCES,
} from "./config";

// ── базові ──────────────────────────────────────────────────────────────────
export const channelSchema = z.enum(CHANNELS);
export const roleSchema = z.enum(ROLES);
export const runStatusSchema = z.enum(RUN_STATUSES);
export const itemStatusSchema = z.enum(ITEM_STATUSES);
export const planEntryStatusSchema = z.enum(PLAN_ENTRY_STATUSES);

export const apiError = z.object({
  error: z.object({ code: z.string(), message: z.string() }),
});

export const decisionActionSchema = z.enum(["approve", "reject", "rerun"]);
export const decisionRequest = z.object({
  action: decisionActionSchema,
  feedback: z.string().optional(),
});
export type DecisionRequest = z.infer<typeof decisionRequest>;

// ── auth ────────────────────────────────────────────────────────────────────
export const sessionResponse = z.object({
  user: z.object({ id: z.string(), email: z.string().email(), name: z.string().nullable() }),
  account: z.object({ id: z.string(), name: z.string(), role: roleSchema }),
});

// ── акаунти користувача (switcher) ────────────────────────────────────────────
// session.account — singular (активний). Для перемикача потрібен список УСІХ акаунтів, де user
// має membership. GET /v1/accounts → { items: accountDTO[] } (видимість — RLS accounts_member_read).
export const accountDTO = z.object({
  id: z.string(),
  name: z.string(),
  role: roleSchema,
});
export type AccountDTO = z.infer<typeof accountDTO>;
export const accountsResponse = z.object({ items: z.array(accountDTO) });

// ── онбординг ────────────────────────────────────────────────────────────────
export const onboardingRequest = z.object({
  name: z.string().min(1),
  websiteUrl: z.string().url().optional(),
  description: z.string().optional(),
});
export const onboardingResponse = z.object({ companyId: z.string() });
export const bootstrapResponse = z.object({ jobId: z.string() });
// Стан AI-bootstrap. `idle` — ніколи не запускали (візард показує кнопку, а не спінер);
// `running` — задача в роботі. Без цих двох «не запускали», «працює» і «впало» виглядали
// однаково, і візард міг показати лише нескінченне очікування.
export const bootstrapStatusResponse = z.object({
  status: z.enum(["idle", "pending", "running", "done", "failed"]),
  error: z.string().nullable().optional(),
  profile: z.record(z.unknown()).optional(),
});
export type BootstrapStatusResponse = z.infer<typeof bootstrapStatusResponse>;

// ── компанія + налаштування ──────────────────────────────────────────────────
export const companyDTO = z.object({
  id: z.string(),
  name: z.string(),
  positioning: z.string().nullable(),
  websiteUrl: z.string().nullable(),
  description: z.string().nullable(),
  stack: z.array(z.string()),
  services: z.array(z.string()),
  audience: z.string().nullable(),
});
export const updateCompanyRequest = companyDTO.omit({ id: true }).partial();

// Список компаній акаунта (company switcher). GET /v1/accounts/:accountId/companies.
export const companiesResponse = z.object({ items: z.array(companyDTO) });

// Per-slot вибір провайдера+моделі (§ADR-0017). Ключ — слот агента (researcher/strategist/…).
export const slotModelSchema = z.object({
  provider: z.enum(["openai", "anthropic", "gemini"]),
  model: z.string().min(1),
});
export const agentModelsSchema = z.record(slotModelSchema);
export type AgentModels = z.infer<typeof agentModelsSchema>;

export const updateSettingsRequest = z.object({
  toneOfVoice: z.string().optional(),
  toneExamples: z.array(z.string()).optional(),
  visualStyle: z.string().optional(),
  forbiddenPhrases: z.array(z.string()).optional(),
  language: z.string().optional(),
  provider: z.enum(["openai", "anthropic", "gemini"]).optional(),
  models: z.record(z.string()).optional(),
  // null → повернення до легасі-режиму (один provider); об'єкт → per-slot override.
  agentModels: agentModelsSchema.nullable().optional(),
});

// GET /v1/companies/:id/settings — read-форма (дзеркало updateSettingsRequest: усі поля present,
// nullable там, де значення може бути порожнім). Write-форма лишається updateSettingsRequest.
export const companySettingsDTO = z.object({
  toneOfVoice: z.string().nullable(),
  toneExamples: z.array(z.string()),
  visualStyle: z.string().nullable(),
  forbiddenPhrases: z.array(z.string()),
  language: z.string(),
  provider: z.enum(["openai", "anthropic", "gemini"]),
  models: z.record(z.string()).nullable(),
  agentModels: agentModelsSchema.nullable(),
});
export type CompanySettingsDTO = z.infer<typeof companySettingsDTO>;

// ── BYOK: ключі провайдерів на рівні акаунта ──────────────────────────────────
// Провайдери, для яких орендар може принести свій ключ. openai/anthropic/gemini — МОДЕЛІ (генерація
// коштує грошей орендаря; для них діє «block, no fallback», §ADR-0016). tavily — веб-пошук: НЕ модель,
// опційне збагачення research; ключ орендаря НЕ обов'язковий — за його відсутності worker падає на
// платформенний ключ (свідомий відступ від block-no-fallback: без пошуку research деградує, не блокує).
export const apiKeyProviderSchema = z.enum(["openai", "anthropic", "gemini", "tavily"]);
export type ApiKeyProvider = z.infer<typeof apiKeyProviderSchema>;

// Маскований DTO — НІКОЛИ не містить самого ключа, лише last4. Читає будь-який член акаунта (щоб
// UI показав статус «ключ налаштовано» і розумів, чому генерація доступна/ні); керують ключами
// лише owner/admin (apikey:manage). Самого ключа немає навіть у відповіді на запис.
export const apiKeyDTO = z.object({
  provider: apiKeyProviderSchema,
  last4: z.string(),
  label: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  lastUsedAt: z.string().nullable(),
});
export type ApiKeyDTO = z.infer<typeof apiKeyDTO>;
export const apiKeysResponse = z.object({ items: z.array(apiKeyDTO) });

export const setApiKeyRequest = z.object({
  key: z.string().min(16), // ключі провайдерів довгі; min відсікає очевидні помилки вводу
  label: z.string().max(100).optional(),
});
export type SetApiKeyRequest = z.infer<typeof setApiKeyRequest>;

// ── контент-план (конфіг) ─────────────────────────────────────────────────────
export const cadenceSchema = z.record(
  z.object({
    weekdays: z.array(z.enum(WEEKDAYS)).optional(),
    everyNWeeks: z.number().int().positive().optional(),
    weekday: z.enum(WEEKDAYS).optional(),
  }),
);
export const contentPlanConfig = z.object({
  cadence: cadenceSchema.optional(),
  pillars: z.array(z.string()).optional(),
  topicMode: z.enum(["suggest", "manual", "backlog"]).default("suggest"),
  planningHorizonWeeks: z.number().int().positive().default(4),
  autoGenerate: z.boolean().default(false),
  autoApprove: z.boolean().default(false),
});
export const updateContentPlanRequest = z.object({
  channelCounts: z.record(z.number().int().nonnegative()).optional(),
  config: contentPlanConfig.partial().optional(),
});

// GET /v1/companies/:id/content-plan — read-форма: збережені channelCounts + частковий config.
export const contentPlanDTO = z.object({
  channelCounts: z.record(z.number()).nullable().optional(),
  config: contentPlanConfig.partial().nullable().optional(),
});
export type ContentPlanDTO = z.infer<typeof contentPlanDTO>;

// ── прогони + айтеми ──────────────────────────────────────────────────────────
// Конфігурація ОДНОГО прогону (§spec 08). Усе тут — override поверх збережених дефолтів ЛИШЕ на цей
// прогін (не мутує company_settings), окрім saveAsDefault. Порожній об'єкт = запуск за дефолтами.
export const MAX_POSTS_PER_RUN = 20; // guardrail: сумарно постів на прогін

// Явна тема для прогону (§spec 08, Phase 2). Коли задано список — генеруємо РІВНО ці теми
// (fan-out: один пост на тему), що дає точну к-сть навіть при недоборі й повний контроль тем.
export const runTopicInputSchema = z.object({
  channel: channelSchema,
  topic: z.string().min(1),
  keyMessage: z.string().optional(),
  seoKeywords: z.array(z.string()).optional(),
});
export type RunTopicInput = z.infer<typeof runTopicInputSchema>;

export const createRunRequest = z.object({
  planEntryIds: z.array(z.string()).optional(), // scoped (календар) — семантика без змін
  channels: z.array(channelSchema).optional(), // ad-hoc: які канали включити
  counts: z.record(z.number().int().min(1)).optional(), // ad-hoc: скільки постів на канал (channel→N)
  topics: z.array(runTopicInputSchema).optional(), // явні теми → fan-out рівно на них (Phase 2)
  angle: z.string().max(500).optional(), // акцент/кут кампанії на прогін (шов; проводка — Phase 2)
  agentModels: agentModelsSchema.nullable().optional(), // per-run per-role моделі
  saveAsDefault: z.boolean().optional(), // додатково зберегти лічильники/моделі як дефолт компанії
});
export type CreateRunRequest = z.infer<typeof createRunRequest>;
export const createRunResponse = z.object({ runId: z.string() });

// Пре-ран оцінка вартості (Phase 4). Приймає ТІ САМІ вхідні дані, що й createRun (той самий резолв
// лічильників/моделей), але нічого не запускає — лише повертає прикидку. cents — цілі центи (округлені).
export const runCostEstimateResponse = z.object({
  cents: z.number().int().nonnegative(),
  textCents: z.number().int().nonnegative(),
  imageCents: z.number().int().nonnegative(),
  posts: z.number().int().nonnegative(),
  images: z.number().int().nonnegative(),
  expensive: z.boolean(),
});
export type RunCostEstimateResponse = z.infer<typeof runCostEstimateResponse>;

// ── Run-config пресети (§Phase 5): названа конфігурація прогону для переюзу ────
// config — підмножина run-config (канали/лічильники/моделі/акцент), яку діалог застосовує замість
// ручного налаштування. Теми свідомо НЕ зберігаємо (вони специфічні для конкретного запуску).
export const runPresetConfig = z.object({
  channels: z.array(channelSchema).optional(),
  counts: z.record(z.number().int().min(1)).optional(),
  agentModels: agentModelsSchema.nullable().optional(),
  angle: z.string().max(500).optional(),
});
export type RunPresetConfig = z.infer<typeof runPresetConfig>;

export const createRunPresetRequest = z.object({
  name: z.string().min(1).max(80),
  config: runPresetConfig,
});
export type CreateRunPresetRequest = z.infer<typeof createRunPresetRequest>;

export const runPresetDTO = z.object({
  id: z.string(),
  name: z.string(),
  config: runPresetConfig,
  createdAt: z.string(),
});
export type RunPresetDTO = z.infer<typeof runPresetDTO>;
export const runPresetsResponse = z.object({ items: z.array(runPresetDTO) });

// ── AI-підбір тем для ad-hoc прогону (topic preview) ──────────────────────────
// Окремий флоу ВІД createRun: тут лише просимо AI запропонувати теми (LLM-виклик), людина їх
// редагує, і вже ЗАТВЕРДЖЕНИЙ список іде у createRun.topics (fan-out, існуючий шлях, без дублю).
// channels — які канали пропонувати; counts — скільки тем на канал (симетрично до ad-hoc counts
// у createRunRequest, але тут ОБОВ'ЯЗКОВО для кожного каналу — інакше нема що синтезувати слотами).
export const suggestRunTopicsRequest = z.object({
  channels: z.array(channelSchema).min(1),
  counts: z.record(z.number().int().min(1)),
  angle: z.string().max(500).optional(),
});
export type SuggestRunTopicsRequest = z.infer<typeof suggestRunTopicsRequest>;
export const suggestRunTopicsResponse = z.object({ draftId: z.string() });

// Стан чернетки підбору тем (GET /v1/companies/:id/topic-drafts/:draftId, для поллінгу з UI).
// pending → LLM ще працює; ready → topics заповнено; failed → error пояснює причину (напр. нема
// ключа провайдера) і UI пропонує впасти назад на ручний ввід/«AI обере на льоту».
export const topicDraftStatusSchema = z.enum(["pending", "ready", "failed"]);
export const topicDraftDTO = z.object({
  status: topicDraftStatusSchema,
  topics: z.array(runTopicInputSchema).nullable(),
  error: z.string().nullable(),
});
export type TopicDraftDTO = z.infer<typeof topicDraftDTO>;

// Знімок конфігурації прогону для показу на сторінці прогону (що саме його породило).
export const runConfigDTO = z.object({
  channels: z.array(channelSchema),
  counts: z.record(z.number()),
  angle: z.string().nullable(),
  provider: z.enum(["openai", "anthropic", "gemini"]),
  models: z.record(z.string()).nullable(),
  agentModels: agentModelsSchema.nullable(),
});
export type RunConfigDTO = z.infer<typeof runConfigDTO>;

export const criterionScore = z.object({
  score: z.number().int().min(1).max(5),
  why: z.string(),
});
export const contentItemDTO = z.object({
  id: z.string(),
  runId: z.string(),
  channel: channelSchema,
  topic: z.string().nullable(),
  // title — людський заголовок (§content-editing). Nullable: пайплайн його не пише, з'являється
  // лише через PATCH; UI фолбечить на topic, коли title відсутній.
  title: z.string().nullable(),
  text: z.string().nullable(),
  scores: z.record(criterionScore).nullable(),
  // Порушення з ПРИВ'ЯЗКОЮ до тексту: quote — дослівний фрагмент поста, issue — суть проблеми.
  // Форма збігається з ViolationSchema пайплайна; код Reviewer'а гарантує, що quote реально є
  // в тексті (інакше порушення відкидається) — саме це робить прапорець flagged змістовним.
  violations: z.array(z.object({ quote: z.string(), issue: z.string() })).nullable(),
  imageUrl: z.string().nullable(),
  status: itemStatusSchema,
  version: z.number().int(),
});
// ── per-node прогрес пайплайна (n8n-подібний «хто зараз виконується») ──────────
// Єдина форма прогресу, узгоджена з фронтом. Worker пише її per-node під час прогону графа
// (generation_runs.progress), api віддає у runDTO. `node` — ЛИШЕ рядок (не enum), щоб додавання
// нової ноди у графі не ламало контракт межі; список актуальних нод — у коментарі.
export const pipelineStep = z.object({
  node: z.string(), // researcher|strategist|writer|writerRevision|visual|reviewer|humanReviewGate
  status: z.enum(["running", "done", "skipped", "error"]),
  at: z.string(), // ISO
});
export type PipelineStep = z.infer<typeof pipelineStep>;

export const runProgress = z.object({
  current: z.string().nullable(), // нода, що виконується зараз, або null (між нодами / завершено)
  steps: z.array(pipelineStep), // впорядкована історія кроків
});
export type RunProgress = z.infer<typeof runProgress>;

export const runDTO = z.object({
  id: z.string(),
  companyId: z.string(),
  status: runStatusSchema,
  scheduledFor: z.string().nullable(),
  costCents: z.number().int(),
  createdAt: z.string(),
  counts: z.object({ items: z.number().int(), needsReview: z.number().int() }).optional(),
  // Прогрес пайплайна (per-node). nullable — до першого кроку/для старих прогонів; optional — list
  // може його не проєктувати (get віддає завжди).
  progress: runProgress.nullable().optional(),
  // Конфігурація, що породила прогін (§spec 08). nullable — старі прогони; optional — list не проєктує.
  runConfig: runConfigDTO.nullable().optional(),
});

// Відповідь на HITL-рішення по прогону (POST /v1/runs/:id/decision, §7). Тверда межа: api лише
// enqueue generation.resume і оптимістично рухає status→running (UI показує рух); фінальний
// статус (approved/rejected/needs_review/failed) виставить worker після відновлення графа.
export const runDecisionResponse = z.object({
  runId: z.string(),
  status: runStatusSchema,
});
export type RunDecisionResponse = z.infer<typeof runDecisionResponse>;
export type ContentItemDTO = z.infer<typeof contentItemDTO>;

// ── людське редагування постів + версії (§content-editing) ───────────────────
// PATCH /v1/content-items/:id — правка тексту/заголовка людиною. text — обов'язковий (порожній
// пост після редагування — це не валідний стан); title — опційний (не всі канали його ведуть).
export const editContentItemRequest = z.object({
  text: z.string().min(1),
  title: z.string().optional(),
});
export type EditContentItemRequest = z.infer<typeof editContentItemRequest>;

export const contentVersionSourceSchema = z.enum(CONTENT_VERSION_SOURCES);
export type ContentVersionSource = z.infer<typeof contentVersionSourceSchema>;

// GET /v1/content-items/:id/versions — історія версій, найновіша перша.
export const contentItemVersionDTO = z.object({
  id: z.string(),
  source: contentVersionSourceSchema,
  text: z.string(),
  title: z.string().nullable(),
  editorUserId: z.string().nullable(),
  createdAt: z.string(),
});
export type ContentItemVersionDTO = z.infer<typeof contentItemVersionDTO>;
export const contentItemVersionsResponse = z.object({ items: z.array(contentItemVersionDTO) });

// POST /v1/content-items/:id/revert — { versionId } повертає айтем до вмісту цієї версії. Append-only:
// revert сам пише НОВУ source:'human' версію, а не видаляє історію (forward action, не rollback БД).
export const revertContentItemRequest = z.object({ versionId: z.string() });
export type RevertContentItemRequest = z.infer<typeof revertContentItemRequest>;

// ── планувальник (plan entries) ───────────────────────────────────────────────
export const planEntryDTO = z.object({
  id: z.string(),
  date: z.string().nullable(),
  channel: channelSchema,
  topic: z.string().nullable(),
  keyMessage: z.string().nullable(),
  seoKeywords: z.array(z.string()),
  pillar: z.string().nullable(),
  source: z.enum(["ai_suggested", "user_defined"]),
  status: planEntryStatusSchema,
});
export const patchPlanEntryRequest = z.object({
  topic: z.string().optional(),
  keyMessage: z.string().optional(),
  seoKeywords: z.array(z.string()).optional(),
  pillar: z.string().optional(),
  date: z.string().nullable().optional(),
});
export const approveEntriesRequest = z.object({ ids: z.array(z.string()).min(1) });
export const materializeRequest = z.object({ horizonWeeks: z.number().int().positive().optional() });

// ── нотифікації + інбокс ──────────────────────────────────────────────────────
export const notificationDTO = z.object({
  id: z.string(),
  type: z.string(),
  title: z.string(),
  body: z.string().nullable(),
  data: z.record(z.unknown()).nullable(),
  readAt: z.string().nullable(),
  createdAt: z.string(),
});
export const notificationsResponse = z.object({
  items: z.array(notificationDTO),
  unreadCount: z.number().int(),
});
export const inboxItemDTO = z.object({
  id: z.string(),
  companyId: z.string().nullable(),
  type: z.string(),
  title: z.string(),
  entityType: z.string().nullable(),
  entityId: z.string().nullable(),
  status: z.enum(["open", "resolved"]),
  createdAt: z.string(),
  data: z.record(z.unknown()).nullable(),
});
export const inboxResponse = z.object({
  items: z.array(inboxItemDTO),
  openCount: z.number().int(),
});
export type NotificationDTO = z.infer<typeof notificationDTO>;
export type NotificationsResponse = z.infer<typeof notificationsResponse>;
export type InboxItemDTO = z.infer<typeof inboxItemDTO>;
export type InboxResponse = z.infer<typeof inboxResponse>;

// ── SSE run-подія (§api-contract /runs/:id/stream) ────────────────────────────
export const runStreamEvent = z.object({
  runId: z.string(),
  status: runStatusSchema,
  progress: z.number().min(0).max(1).optional(),
  message: z.string().optional(),
});
