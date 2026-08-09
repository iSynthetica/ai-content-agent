import { z } from "zod";
import { PUBLISH_PROVIDERS } from "./config";

// Контракти черги (SH-3) — заморожують межу api↔worker.
// jobId — детермінований (ідемпотентність); accountId — для job-scoped RLS-контексту.

export const generationStartJob = z.object({
  kind: z.literal("generation.start"),
  jobId: z.string(),
  accountId: z.string(),
  runId: z.string(),
  companyId: z.string(),
  planEntryIds: z.array(z.string()).optional(), // planScope: скоуп на обрані слоти
});

export const generationResumeJob = z.object({
  kind: z.literal("generation.resume"),
  jobId: z.string(),
  accountId: z.string(),
  runId: z.string(),
  threadId: z.string(),
  decision: z.object({
    action: z.enum(["approve", "reject", "rerun"]),
    feedback: z.string().optional(),
  }),
});

export const onboardingBootstrapJob = z.object({
  kind: z.literal("onboarding.bootstrap"),
  jobId: z.string(),
  accountId: z.string(),
  companyId: z.string(),
});

export const suggestTopicsJob = z.object({
  kind: z.literal("planner.suggest_topics"),
  jobId: z.string(),
  accountId: z.string(),
  companyId: z.string(),
  contentPlanId: z.string(),
  planEntryIds: z.array(z.string()).optional(),
});

// AI-підбір тем для ad-hoc прогону (topic preview, §runtopics): окремий job від planner.suggest_topics
// — тут немає плану/слотів БД, лише синтетичні TopicSlot'и, побудовані worker'ом із draft.input
// (channels+counts). draftId — єдиний вказівник на рядок run_topic_drafts, куди пишеться результат.
export const suggestRunTopicsJob = z.object({
  kind: z.literal("runtopics.suggest"),
  jobId: z.string(),
  accountId: z.string(),
  companyId: z.string(),
  draftId: z.string(),
});

// Картинки ПОЗА критичним шляхом прогону (§7.4): генерація одного зображення ~40с, що було
// 60%+ часу до needs_review. Текст показуємо людині одразу, картинки домальовуються фоном
// і доїжджають у content_items.image_url. targets несе ГОТОВИЙ промпт — хендлеру не треба
// перечитувати компанію/драфти, а промпт-логіка лишається у пайплайні (buildImagePrompt).
export const contentVisualsJob = z.object({
  kind: z.literal("content.visuals"),
  jobId: z.string(),
  accountId: z.string(),
  runId: z.string(),
  companyId: z.string(),
  // Снапшот прогону — щоб фонова генерація малювала ТІЄЮ Ж моделлю, що обрана в налаштуваннях
  // на момент запуску (а не тією, що стане дефолтною пізніше).
  modelConfig: z.object({
    provider: z.enum(["openai", "anthropic", "gemini"]),
    models: z.record(z.string()),
  }),
  targets: z.array(z.object({ itemId: z.string(), prompt: z.string() })).min(1),
});

// Публікація схвалених постів у соцмережі (§publishing §1.4) — фонова job, як content.visuals:
// зовнішній API повільний, тож поза request-path. targets несе лише itemId+provider; токени
// resolve'ляться воркером за accountId на момент виконання (НЕ у payload/checkpointer, §ADR-0016).
export const publishContentJob = z.object({
  kind: z.literal("content.publish"),
  jobId: z.string(),
  accountId: z.string(),
  runId: z.string(),
  targets: z
    .array(z.object({ itemId: z.string(), provider: z.enum(PUBLISH_PROVIDERS) }))
    .min(1),
});

export const job = z.discriminatedUnion("kind", [
  generationStartJob,
  generationResumeJob,
  onboardingBootstrapJob,
  suggestTopicsJob,
  suggestRunTopicsJob,
  contentVisualsJob,
  publishContentJob,
]);
export type Job = z.infer<typeof job>;
