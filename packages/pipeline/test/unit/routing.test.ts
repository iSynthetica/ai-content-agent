// Unit — routing (§14, S12). Дві петлі ревізії з незалежними cap'ами (MAX_REVISIONS=3, MAX_HUMAN=2).
import { describe, expect, it } from "vitest";
import { routeAfterHuman, routeAfterReviewer } from "../../src/lib/routing";
import type { ContentStateT } from "../../src/state";

// Мінімальний state-стаб — лише поля, потрібні конкретному router'у.
function st(partial: Partial<ContentStateT>): ContentStateT {
  return partial as ContentStateT;
}

describe("routeAfterReviewer (авто-петля, cap MAX_REVISIONS)", () => {
  const nr = { id: "a", status: "needs_revision" } as never;
  it("needs_revision і revisionCount<3 → writerRevision", () => {
    expect(routeAfterReviewer(st({ final: [nr], revisionCount: 1 }))).toBe("writerRevision");
  });
  it("needs_revision але revisionCount=3 (cap) → humanReviewGate", () => {
    expect(routeAfterReviewer(st({ final: [nr], revisionCount: 3 }))).toBe("humanReviewGate");
  });
  it("немає needs_revision → humanReviewGate", () => {
    const s = st({ final: [{ id: "a", status: "approved" } as never], revisionCount: 0 });
    expect(routeAfterReviewer(s)).toBe("humanReviewGate");
  });
});

describe("routeAfterHuman (людська петля, cap MAX_HUMAN_REVISIONS)", () => {
  it("request_revision з itemIds і humanRevisionCount<=2 → writerRevision", () => {
    const s = st({
      humanDecision: { action: "request_revision", itemIds: ["x"] },
      humanRevisionCount: 1,
    });
    expect(routeAfterHuman(s)).toBe("writerRevision");
  });
  it("approve → done", () => {
    expect(routeAfterHuman(st({ humanDecision: { action: "approve" }, humanRevisionCount: 0 }))).toBe(
      "done",
    );
  });
  it("порожній itemIds → done (не no-op writerRevision)", () => {
    const s = st({
      humanDecision: { action: "request_revision", itemIds: [] },
      humanRevisionCount: 0,
    });
    expect(routeAfterHuman(s)).toBe("done");
  });
  it("людський cap вичерпано (humanRevisionCount>2) → done", () => {
    const s = st({
      humanDecision: { action: "request_revision", itemIds: ["x"] },
      humanRevisionCount: 3,
    });
    expect(routeAfterHuman(s)).toBe("done");
  });
});
