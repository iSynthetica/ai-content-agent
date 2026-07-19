// Публічна поверхня пакета (§9 spike-1) — фасад createPipeline(deps): PipelineHandle
// зі start/resume/getState. Worker НЕ бачить StateGraph; уся взаємодія — через цей контракт.
import { Command } from "@langchain/langgraph";
import { buildGraph } from "./graph";
import type { GraphDeps, PipelineDeps } from "./ports";
import type { ContentStateT, RunCost } from "./state";
import type { ModelConfig } from "./config";
import type {
  HumanDecision,
  PipelineHandle,
  PipelineInput,
  PipelineOutput,
  PipelineResult,
  ProgressCallback,
  ReviewInterruptPayload,
} from "./types";

// Визначений порожній результат для «thread не стартував / не знайдено».
const EMPTY_OUTPUT: PipelineOutput = { final: [], research: null, costCents: 0, errors: [] };

function toError(e: unknown): { message: string; node?: string } {
  return { message: e instanceof Error ? e.message : String(e) };
}

// Null-безпечний мапінг ContentStateT → PipelineOutput (толерантний до частково заповненого стану).
function toOutput(state: Partial<ContentStateT> | undefined): PipelineOutput {
  const cost: RunCost = state?.cost ?? { cents: 0, tokens: 0 };
  return {
    final: state?.final ?? [],
    research: state?.research ?? null,
    costCents: Math.round(cost.cents),
    errors: state?.errors ?? [],
  };
}

// Реальні ноди графа (§8). Updates-стрім інколи емітить і службові ключі (__interrupt__, __metadata__);
// у прогрес пускаємо ЛИШЕ справжні ноди — решту відкидаємо.
const GRAPH_NODES = new Set<string>([
  "researcher",
  "strategist",
  "writer",
  "visual",
  "reviewer",
  "writerRevision",
  "humanReviewGate",
]);

// Структурний зріз StateSnapshot (getState) — нам треба лише values + interrupts у tasks,
// тож не тягнемо повний тип із @langchain/langgraph.
type GraphSnapshot = {
  values: unknown;
  tasks: ReadonlyArray<{ interrupts?: ReadonlyArray<{ value?: ReviewInterruptPayload }> }>;
};

// Interrupt-payload зі снапшоту (перерваний граф тримає pending-task з interrupts[]).
function interruptOf(snap: GraphSnapshot): ReviewInterruptPayload | undefined {
  for (const t of snap.tasks) {
    const it = t.interrupts?.[0]?.value;
    if (it) return it;
  }
  return undefined;
}

// interpret() — прив'язка до LangGraph.js 1.0 API. Після updates-стріму фінальний стан беремо з
// checkpointer (getState — updates НЕ повертає повний state), interrupt — з tasks[].interrupts[].value.
function interpretSnapshot(snap: GraphSnapshot, threadId: string): PipelineResult {
  const output = toOutput(snap.values as Partial<ContentStateT> | undefined);
  const it = interruptOf(snap);
  if (it) return { status: "needs_review", threadId, interrupt: it, output };
  return { status: "completed", threadId, output };
}

// runGraph — прогін графа в updates-стрімі з per-node емісією прогресу. ЗБЕРІГАЄ поточну поведінку
// interrupt/фінального output: стрім до interrupt/END → getState → interpret. Кожен стрімнутий
// ключ-нода → onProgress(node,"running") перед і "done" після (updates-чанк = { [node]: patch }).
async function runGraph(
  graph: ReturnType<typeof buildGraph>,
  input: Parameters<ReturnType<typeof buildGraph>["stream"]>[0],
  cfg: Parameters<ReturnType<typeof buildGraph>["getState"]>[0],
  threadId: string,
  onProgress?: ProgressCallback,
): Promise<PipelineResult> {
  const stream = await graph.stream(input, { ...cfg, streamMode: "updates" });
  for await (const chunk of stream) {
    for (const node of Object.keys(chunk as Record<string, unknown>)) {
      if (!GRAPH_NODES.has(node)) continue; // службові ключі стріму — не ноди
      onProgress?.(node, "running");
      onProgress?.(node, "done");
    }
  }
  const snap = (await graph.getState(cfg)) as unknown as GraphSnapshot;
  return interpretSnapshot(snap, threadId);
}

export function createPipeline(deps: PipelineDeps): PipelineHandle {
  // PipelineDeps → GraphDeps: розв'язуємо ModelFactory з конкретного modelConfig цього прогону.
  const graphDepsFor = (modelConfig: ModelConfig): GraphDeps => ({ ...deps, models: deps.models(modelConfig) });

  // READ-шлях (getState): ноди не виконуються, тож реальний ModelFactory не потрібен —
  // підставляємо лінивий фейк, який кине, якщо його раптом торкнуться.
  const readGraphDeps = (): GraphDeps => ({
    ...deps,
    models: {
      forAgent() {
        throw new Error("read-path: model not resolvable");
      },
      imageModel() {
        throw new Error("read-path: image model not resolvable");
      },
    },
  });

  return {
    async start(input, threadId, opts) {
      const graph = buildGraph(graphDepsFor(input.modelConfig));
      const cfg = {
        configurable: { thread_id: threadId },
        metadata: { ...input.meta }, // LangSmith: runId/accountId/companyId
        tags: ["pipeline", input.meta.accountId],
      };
      try {
        return await runGraph(
          graph,
          {
            company: input.company,
            channelConfig: input.channelConfig ?? {}, // скоупнутий режим не несе channelConfig
            planScope: input.planScope ?? null, // null → повний режим
            modelConfig: input.modelConfig, // персиститься у стані → доступний для resume
            meta: input.meta,
          },
          cfg,
          threadId,
          opts?.onProgress,
        );
      } catch (e) {
        return { status: "failed", threadId, error: toError(e) };
      }
    },

    async resume(threadId, decision: HumanDecision, opts) {
      const cfg = { configurable: { thread_id: threadId } };
      // modelConfig беремо з persisted-стану — resume самодостатній за threadId.
      const tuple = await deps.checkpointer.getTuple(cfg);
      const modelConfig = tuple?.checkpoint.channel_values.modelConfig as ModelConfig | undefined;
      if (!modelConfig) {
        return { status: "failed", threadId, error: { message: "no checkpoint for thread" } };
      }
      const graph = buildGraph(graphDepsFor(modelConfig));
      try {
        return await runGraph(graph, new Command({ resume: decision }), cfg, threadId, opts?.onProgress);
      } catch (e) {
        return { status: "failed", threadId, error: toError(e) };
      }
    },

    async getState(threadId) {
      const cfg = { configurable: { thread_id: threadId } };
      const tuple = await deps.checkpointer.getTuple(cfg);
      // Thread ще не стартував / не знайдено: повертаємо визначений порожній результат.
      if (!tuple) return { output: EMPTY_OUTPUT, interrupted: false };
      const snap = await buildGraph(readGraphDeps()).getState(cfg);
      const interrupted = snap.tasks.some(
        (t) => ((t as { interrupts?: unknown[] }).interrupts?.length ?? 0) > 0,
      );
      return { output: toOutput(snap.values as ContentStateT), interrupted };
    },
  };
}

// ── публічні типи, схеми, порти, конфіг (те, що імпортує worker) ──
export * from "./types";
export * from "./schemas";
export * from "./ports";
export * from "./config";
export {
  ContentState,
  type ContentStateT,
  type RunCost,
  addCost,
  mergeDraftsById,
  mergeFinalById,
} from "./state";
export { buildGraph, routeAfterReviewer, routeAfterHuman } from "./graph";
export { buildImagePrompt, renderVisuals } from "./visuals";
export type { VisualTarget, RenderedVisual } from "./visuals";

// defaultModelFactory — експортована зручність для worker (composition root замикає секрети, §5/§6).
export { defaultModelFactory } from "./models/defaultModelFactory";

// Трекінг вартості (§7/§9) — публічний для worker/eval.
export { costFromUsage, imageCost, type UsageMetadata } from "./lib/cost";

// Чисті helper'и агентів — реюз/тестування (dedup, статус-логіка).
export { deduplicateTopics } from "./agents/strategist";
export { averageScore, determineStatus } from "./agents/reviewer";
