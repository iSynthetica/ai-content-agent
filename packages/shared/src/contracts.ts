import { z } from "zod";
import {
  CHANNELS, ROLES, RUN_STATUSES, ITEM_STATUSES, PLAN_ENTRY_STATUSES, WEEKDAYS,
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
export const bootstrapStatusResponse = z.object({
  status: z.enum(["pending", "done", "failed"]),
  profile: z.record(z.unknown()).optional(),
});

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

export const updateSettingsRequest = z.object({
  toneOfVoice: z.string().optional(),
  toneExamples: z.array(z.string()).optional(),
  visualStyle: z.string().optional(),
  forbiddenPhrases: z.array(z.string()).optional(),
  language: z.string().optional(),
  provider: z.enum(["openai", "anthropic"]).optional(),
  models: z.record(z.string()).optional(),
});

// GET /v1/companies/:id/settings — read-форма (дзеркало updateSettingsRequest: усі поля present,
// nullable там, де значення може бути порожнім). Write-форма лишається updateSettingsRequest.
export const companySettingsDTO = z.object({
  toneOfVoice: z.string().nullable(),
  toneExamples: z.array(z.string()),
  visualStyle: z.string().nullable(),
  forbiddenPhrases: z.array(z.string()),
  language: z.string(),
  provider: z.enum(["openai", "anthropic"]),
  models: z.record(z.string()).nullable(),
});
export type CompanySettingsDTO = z.infer<typeof companySettingsDTO>;

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
export const createRunRequest = z.object({ planEntryIds: z.array(z.string()).optional() });
export const createRunResponse = z.object({ runId: z.string() });

export const criterionScore = z.object({
  score: z.number().int().min(1).max(5),
  why: z.string(),
});
export const contentItemDTO = z.object({
  id: z.string(),
  runId: z.string(),
  channel: channelSchema,
  topic: z.string().nullable(),
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
