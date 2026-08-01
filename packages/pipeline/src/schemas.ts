// Внутрішні доменні Zod-схеми пайплайна (§4 spike-1). НЕ HTTP-контракт (той живе у @forteq/shared).
// Канонічний enum каналів імпортуємо зі спільного пакета, щоб не дублювати словник.
import { z } from "zod";
import { channelSchema } from "@forteq/shared";

export const ResearchResultSchema = z.object({
  companyContext: z.string(),
  nicheTopics: z.array(z.string()).min(5),
  audiencePains: z.array(z.string()).min(3),
  competitorPatterns: z.array(z.string()).default([]),
  // НЕ .url() на LLM-виводі: строга валідація тут = hard-fail усього прогону через один кривий рядок.
  // Санітизацію URL робимо кодом у ноді Researcher (§7.1).
  sources: z.array(z.string()).default([]),
});

export const ContentPlanItemSchema = z.object({
  id: z.string(), // uuid, генерується КОДОМ у Strategist (не LLM)
  topic: z.string(),
  channel: channelSchema,
  format: z.string(),
  keyMessage: z.string(),
  seoKeywords: z.array(z.string()).default([]),
});

export const CriterionScoreSchema = z.object({
  score: z.number().int().min(1).max(5),
  why: z.string().min(20).max(300),
});

export const DraftItemSchema = z.object({
  // ІНВАРІАНТ: id === planItemId (identity). Задається кодом у writeOne як draft.id = plan.id,
  // НЕ генерується заново — саме це робить mergeDraftsById заміною, а не дублюванням при ревізії.
  id: z.string(),
  planItemId: z.string(), // === id; тримаємо обидва поля для явності join'у до плану
  channel: channelSchema,
  topic: z.string(), // тема з ContentPlanItem — несемо крізь draft, щоб вона дожила до content_items
  text: z.string(),
  metadata: z
    .object({
      wordCount: z.number().optional(),
      imagePromptSuggestion: z.string().optional(), // тільки instagram
      metaDescription: z.string().optional(), // тільки blog
    })
    .passthrough(),
  revisionHistory: z.array(z.string()).default([]),
});

// Порушення, ПРИВ'ЯЗАНЕ до тексту: quote — дослівний фрагмент поста, issue — у чому проблема.
// Прив'язка не косметична, а механізм довіри: код звіряє quote з текстом поста і відкидає все,
// що не цитується (groundViolations у reviewer.ts). Через це модель фізично не може «відзвітувати
// про відсутність порушень» — процитувати відсутність нема чого. Саме цим лікується стара
// поведінка, коли у violations їхали рядки «none», «-», «Немає явних порушень…», і похідний
// прапорець flagged ставав безсенсовим (спрацьовував майже на кожному пості).
export const ViolationSchema = z.object({
  quote: z.string(), // дослівний фрагмент поста; порожній лише для rule-based (генерує код)
  issue: z.string(), // у чому саме проблема
});

export const FactCheckResultSchema = z.object({
  companyFactsInPost: z.array(z.string()),
  factsInBrief: z.array(z.string()),
  violations: z.array(ViolationSchema),
  verdict: z.enum(["pass", "fail"]),
});

export const ReviewResultSchema = z.object({
  draftId: z.string(),
  scores: z.object({
    toneAlignment: CriterionScoreSchema,
    specificity: CriterionScoreSchema,
    factualCoherence: CriterionScoreSchema,
    channelFit: CriterionScoreSchema,
  }),
  factCheck: FactCheckResultSchema,
  hedgingIssues: z.array(ViolationSchema),
  // Зведеного violations від МОДЕЛІ більше немає: він був простим злиттям інших полів і третім
  // джерелом шуму. Підсумковий список збирає КОД з перевірених джерел (reviewer.ts).
  status: z.enum(["approved", "flagged", "needs_revision"]), // QA-статус пайплайна (§4)
});

// FinalItem = Draft + Review — проєкція фінального стану, що повертається worker'у.
export const FinalItemSchema = DraftItemSchema.extend({
  scores: ReviewResultSchema.shape.scores,
  factCheck: FactCheckResultSchema,
  violations: z.array(ViolationSchema),
  status: ReviewResultSchema.shape.status,
  // Людський фідбек до перепису — виставляє humanReviewGate (не Reviewer); null у авто-петлі (§7.3).
  revisionNote: z.string().nullable().default(null),
});

export type ResearchResult = z.infer<typeof ResearchResultSchema>;
export type ContentPlanItem = z.infer<typeof ContentPlanItemSchema>;
export type CriterionScore = z.infer<typeof CriterionScoreSchema>;
export type DraftItem = z.infer<typeof DraftItemSchema>;
export type Violation = z.infer<typeof ViolationSchema>;
export type FactCheckResult = z.infer<typeof FactCheckResultSchema>;
export type ReviewResult = z.infer<typeof ReviewResultSchema>;
export type FinalItem = z.infer<typeof FinalItemSchema>;
