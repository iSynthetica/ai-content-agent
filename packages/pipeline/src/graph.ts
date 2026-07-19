// Граф (§8 spike-1) — топологія, conditional edges, дві петлі ревізії, interrupt.
//
//   START → researcher → strategist → writer → reviewer → [routeAfterReviewer]
//                                                       ┌──── needs_revision & revisionCount<MAX ────┐
//                                                       ▼                                             │
//                                              writerRevision ────────────────────────────────────────┘
//                                       (немає needs_revision АБО ліміт) → humanReviewGate ─(interrupt)
//                                              resume approve/reject → END; resume request_revision → writerRevision
//
// Картинок у графі НЕМАЄ (§7.4): генерація зображення ~40с тримала людину в очікуванні перед
// рецензією тексту. Тепер їх малює окрема job `content.visuals` після завершення прогону,
// а image_url доїжджає у content_items асинхронно (див. visuals.ts).
import { END, START, StateGraph, interrupt } from "@langchain/langgraph";
import type { GraphDeps } from "./ports";
import { ContentState, type ContentStateT } from "./state";
import type { HumanDecision, ReviewInterruptPayload } from "./types";
import { makeResearcherNode } from "./agents/researcher";
import { makeStrategistNode } from "./agents/strategist";
import { makeWriterNode } from "./agents/writer";
import { averageScore, makeReviewerNode } from "./agents/reviewer";
import { routeAfterHuman, routeAfterReviewer } from "./lib/routing";

// Re-export routing (§8) — публічна поверхня через index.ts зберігається.
export { routeAfterHuman, routeAfterReviewer } from "./lib/routing";

// humanReviewGate — єдина точка interrupt (МВП). Матеріалізує людське рішення у стан (§8).
const makeHumanGateNode =
  (deps: GraphDeps) =>
  async (s: ContentStateT): Promise<Partial<ContentStateT>> => {
    const payload: ReviewInterruptPayload = {
      runId: s.meta.runId,
      items: s.final.map((f) => ({
        id: f.id,
        channel: f.channel,
        status: f.status,
        violations: f.violations,
        avgScore: averageScore(f.scores),
      })),
      flaggedCount: s.final.filter((f) => f.status !== "approved").length,
    };
    // interrupt() серіалізує payload й ставить граф на паузу (checkpointer);
    // код нижче виконається ЛИШЕ після resume (коли decision вже відоме).
    const decision = interrupt(payload) as HumanDecision;

    // approve/reject: рішення просто зберігаємо; маршрут → done (routeAfterHuman).
    if (decision.action !== "request_revision") return { humanDecision: decision };

    // request_revision: цілі з decision.itemIds → status "needs_revision" (незалежно від попереднього,
    // зокрема flagged), notes → revisionNote; скидаємо АВТО-бюджет (revisionCount:0), інкремент людського.
    const targetIds = new Set(decision.itemIds);
    const marked = s.final
      .filter((f) => targetIds.has(f.id))
      .map((f) => ({ ...f, status: "needs_revision" as const, revisionNote: decision.notes ?? null }));

    return {
      humanDecision: decision,
      humanRevisionCount: s.humanRevisionCount + 1,
      final: marked, // mergeFinalById домердж: перезаписує лише марковані, решту зберігає
      revisionCount: 0,
    };
  };

// buildGraph(deps) — компіляція StateGraph. GraphDeps: ModelFactory вже розв'язаний (§5).
export function buildGraph(deps: GraphDeps) {
  const g = new StateGraph(ContentState)
    .addNode("researcher", makeResearcherNode(deps))
    .addNode("strategist", makeStrategistNode(deps))
    .addNode("writer", makeWriterNode(deps, "initial"))
    .addNode("reviewer", makeReviewerNode(deps))
    .addNode("writerRevision", makeWriterNode(deps, "revision"))
    .addNode("humanReviewGate", makeHumanGateNode(deps))
    .addEdge(START, "researcher")
    .addEdge("researcher", "strategist")
    .addEdge("strategist", "writer")
    .addEdge("writer", "reviewer")
    .addConditionalEdges("reviewer", routeAfterReviewer, {
      writerRevision: "writerRevision",
      humanReviewGate: "humanReviewGate",
    })
    .addEdge("writerRevision", "reviewer")
    .addConditionalEdges("humanReviewGate", routeAfterHuman, {
      writerRevision: "writerRevision",
      done: END,
    });

  return g.compile({ checkpointer: deps.checkpointer });
}
