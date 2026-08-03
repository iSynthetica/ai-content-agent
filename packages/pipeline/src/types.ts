// Публічні DTO — ЗАМОРОЖЕНИЙ контракт worker↔pipeline (§9 spike-1). Типи реальні.
// Worker НЕ бачить StateGraph; уся взаємодія — через PipelineHandle (див. index.ts).
import type { Channel } from "@forteq/shared";
import type { ModelConfig } from "./config";
import type { FinalItem, ResearchResult, Violation } from "./schemas";

// Plain data, зібрана worker'ом з БД (brief + brand + settings). Пайплайн її не інтерпретує як таблиці.
export interface CompanyContext {
  name: string;
  positioning?: string;
  stack: string[];
  services: string[];
  audience?: string;
  toneOfVoice?: string;
  toneExamples: string[];
  visualStyle?: string;
  forbiddenPhrases: string[];
  language: string;
  // Акцент/кут кампанії НА ЦЕЙ ПРОГІН (per-run, з run_config.angle). CompanyContext будується
  // заново на кожен generation.start, тож per-run поле тут коректне (не кешується між прогонами).
  // Впливає на вибір тем (strategist) і на текст поста (writer); фактів бренду не змінює.
  campaignAngle?: string;
}

export interface RunMeta {
  runId: string;
  accountId: string;
  companyId: string;
}

// Обраний людиною слот плану (проєкція plan_entries) для скоупнутого режиму (§5, §7.2).
// id === plan_entries.id — стане ContentPlanItem.id → content_item.id (провенанс лінку слота, §13).
export interface PlanEntryInput {
  id: string;
  channel: Channel;
  topic: string; // зафіксована людиною тема (не перегенеровується)
  keyMessage?: string; // якщо порожній — Strategist дозаповнює одним LLM-викликом
  seoKeywords?: string[];
  pillar?: string;
}

interface PipelineInputBase {
  company: CompanyContext;
  modelConfig: ModelConfig; // резолвлений снапшот (§6)
  meta: RunMeta;
}

// Два взаємовиключні режими на рівні типу: повний (channelConfig) / скоупнутий (planScope).
// Union унеможливлює передати обидва або жодного.
export type PipelineInput = PipelineInputBase &
  (
    | { channelConfig: Record<string, number>; planScope?: never } // повний режим
    | { planScope: PlanEntryInput[]; channelConfig?: never } // скоупнутий режим (раунд 2 §5)
  );

export type HumanDecision =
  | { action: "approve" }
  | { action: "reject"; reason?: string }
  | { action: "request_revision"; itemIds: string[]; notes?: string };

// Payload, який граф серіалізує в interrupt() і worker дістає назад для UI (крок 4 §10).
export interface ReviewInterruptItem {
  id: string;
  channel: Channel;
  status: "approved" | "flagged" | "needs_revision";
  violations: Violation[]; // прив'язані до тексту (quote + issue), див. ViolationSchema
  avgScore: number;
}

export interface ReviewInterruptPayload {
  runId: string;
  items: ReviewInterruptItem[];
  flaggedCount: number;
}

// Проєкція фінального стану — те, що worker мапить у content_items/generation_runs.
export interface PipelineOutput {
  final: FinalItem[];
  research: ResearchResult | null; // null для рано-перерваного/непочатого прогону
  costCents: number;
  errors: string[];
}

// Термінальні ДОМЕННІ сигнали (§9.1). Нотифікації/інбокс пайплайн не знає — це робота api/worker.
export type PipelineResult =
  | { status: "needs_review"; threadId: string; interrupt: ReviewInterruptPayload; output: PipelineOutput }
  | { status: "completed"; threadId: string; output: PipelineOutput }
  | { status: "failed"; threadId: string; error: { message: string; node?: string } };

// Per-node прогрес (§progress): пайплайн кличе onProgress на кожну ноду під час updates-стріму —
// "running" перед виконанням-ефектом, "done" після. Статус звужений до контракту межі (worker
// маплить у runProgress). node — рядок (назва ноди графа).
export type PipelineProgressStatus = "running" | "done";
export type ProgressCallback = (node: string, status: PipelineProgressStatus) => void;

// Опції прогону start/resume. Опційні — наявний контракт (без opts) НЕ змінюється.
export interface PipelineRunOptions {
  onProgress?: ProgressCallback;
}

// Публічна поверхня пакета — фасад, що його викликає worker.
export interface PipelineHandle {
  // Свіжий прогін. Резолвиться, коли граф став на interrupt або завершився. opts.onProgress — per-node прогрес.
  start(input: PipelineInput, threadId: string, opts?: PipelineRunOptions): Promise<PipelineResult>;
  // Продовження після рішення людини. opts.onProgress — per-node прогрес.
  resume(threadId: string, decision: HumanDecision, opts?: PipelineRunOptions): Promise<PipelineResult>;
  // Поточний персистований стан (для статусу/дебагу).
  getState(threadId: string): Promise<{ output: PipelineOutput; interrupted: boolean }>;
}
