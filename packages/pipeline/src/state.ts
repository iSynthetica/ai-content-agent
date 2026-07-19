// Стан графа (§3 spike-1): ContentState = Annotation.Root(...) з reducer'ами.
// camelCase-поля; reducer'и — робочі скелет-версії з реальними сигнатурами й інваріантами.
import { Annotation } from "@langchain/langgraph";
import type { ModelConfig } from "./config";
import type { CompanyContext, HumanDecision, PlanEntryInput, RunMeta } from "./types";
import type { ContentPlanItem, DraftItem, FinalItem, ResearchResult } from "./schemas";

// Акумульована вартість прогону (float-cents; округлення лише при мапінгу в PipelineOutput).
export interface RunCost {
  cents: number;
  tokens: number;
}

// ── reducer'и ────────────────────────────────────────────────────────────────

// mergeDraftsById — заміна драфта за id (при ревізії Writer переписує окремі елементи),
// решта зберігається. Без цього наївний concat дублював би пости.
export function mergeDraftsById(current: DraftItem[], update: DraftItem[]): DraftItem[] {
  const byId = new Map(current.map((d) => [d.id, d]));
  for (const d of update) byId.set(d.id, d);
  return [...byId.values()];
}

// mergeFinalById — симетрично до drafts: домердж final за id, зберігає раніше approved
// (replace-reducer зітер би їх). Reviewer емітить лише рев'юнуті цього проходу (§7.5).
export function mergeFinalById(current: FinalItem[], update: FinalItem[]): FinalItem[] {
  const byId = new Map(current.map((f) => [f.id, f]));
  for (const f of update) byId.set(f.id, f);
  return [...byId.values()];
}

// addCost — акумуляція вартості з usage_metadata кожної LLM-відповіді (§7, §9).
export function addCost(current: RunCost, update: RunCost): RunCost {
  return { cents: current.cents + update.cents, tokens: current.tokens + update.tokens };
}

export const ContentState = Annotation.Root({
  // ── Input (immutable протягом run) ──
  company: Annotation<CompanyContext>(),
  channelConfig: Annotation<Record<string, number>>(), // { linkedin:5, ... } (повний режим)
  planScope: Annotation<PlanEntryInput[] | null>(), // раунд 2 §5: якщо задано — теми зафіксовані
  modelConfig: Annotation<ModelConfig>(), // снапшот; персиститься для resume
  meta: Annotation<RunMeta>(), // runId, accountId, companyId (для трейсів)

  // ── Agent outputs ──
  research: Annotation<ResearchResult>(),
  contentPlan: Annotation<ContentPlanItem[]>(),
  drafts: Annotation<DraftItem[]>({ reducer: mergeDraftsById, default: () => [] }),
  final: Annotation<FinalItem[]>({ reducer: mergeFinalById, default: () => [] }),

  // ── Control ──
  revisionCount: Annotation<number>({ reducer: (_, b) => b, default: () => 0 }), // авто-петля
  humanRevisionCount: Annotation<number>({ reducer: (_, b) => b, default: () => 0 }), // людська петля
  cost: Annotation<RunCost>({ reducer: addCost, default: () => ({ cents: 0, tokens: 0 }) }),
  errors: Annotation<string[]>({ reducer: (a, b) => a.concat(b), default: () => [] }), // ізоляція per-item

  // ── HITL ──
  humanDecision: Annotation<HumanDecision | null>({ reducer: (_, b) => b, default: () => null }),
});

export type ContentStateT = typeof ContentState.State;
