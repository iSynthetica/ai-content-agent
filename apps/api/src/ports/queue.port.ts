// QueuePort — тверда межа api→черга (spike-2 §2.3, §4.3). api лише КЛАДЕ job у чергу;
// граф виконує worker (§2.7). Порт мапиться на job-контракти @forteq/shared (jobs.ts) —
// заморожену межу api↔worker. jobId детермінований → BullMQ dedup (ідемпотентність enqueue).

export interface EnqueueRunPayload {
  runId: string;
  accountId: string; // job-scoped RLS-контекст воркера (§2.10.4)
  companyId: string;
  threadId: string;
  mode: "generate" | "resume";
  planEntryIds?: string[]; // §2.11: run скоупнутий на обрані слоти (Strategist skip/reduce)
  resume?: { action: "approve" | "reject" | "rerun"; feedback?: string };
  nonce?: string; // для resume-jobId; за замовчуванням генерується
}

export interface EnqueueBootstrapPayload {
  accountId: string;
  companyId: string;
}

export interface EnqueueSuggestTopicsPayload {
  accountId: string;
  companyId: string;
  contentPlanId: string;
  planEntryIds?: string[];
}

export interface QueuePort {
  // generate → generation.start; resume → generation.resume (jobs.ts).
  enqueueRun(payload: EnqueueRunPayload): Promise<{ jobId: string }>;
  // §2.12 онбординг-enrichment → onboarding.bootstrap.
  enqueueBootstrap(payload: EnqueueBootstrapPayload): Promise<{ jobId: string }>;
  // §2.11 підбір тем → planner.suggest_topics.
  enqueueSuggestTopics(payload: EnqueueSuggestTopicsPayload): Promise<{ jobId: string }>;
}
