// Unit — reducer'и стану + cost (§14, S4). Прямий виклик, без моків.
import { describe, expect, it } from "vitest";
import { addCost, mergeDraftsById, mergeFinalById } from "../../src/state";
import { costFromUsage, imageCost } from "../../src/lib/cost";
import type { DraftItem, FinalItem } from "../../src/schemas";

function draft(id: string, text: string): DraftItem {
  return { id, planItemId: id, channel: "linkedin", text, metadata: {}, revisionHistory: [] };
}
function final(id: string, status: FinalItem["status"], text = "t"): FinalItem {
  return {
    ...draft(id, text),
    scores: {
      toneAlignment: { score: 4, why: "x".repeat(20) },
      specificity: { score: 4, why: "x".repeat(20) },
      factualCoherence: { score: 4, why: "x".repeat(20) },
      channelFit: { score: 4, why: "x".repeat(20) },
    },
    factCheck: { companyFactsInPost: [], factsInBrief: [], violations: [], verdict: "pass" },
    violations: [],
    status,
    revisionNote: null,
  };
}

describe("mergeDraftsById", () => {
  it("замінює драфт за id, решту зберігає (ревізія переписує окремі елементи)", () => {
    const cur = [draft("a", "A"), draft("b", "B")];
    const next = mergeDraftsById(cur, [draft("a", "A2")]);
    expect(next).toHaveLength(2);
    expect(next.find((d) => d.id === "a")?.text).toBe("A2");
    expect(next.find((d) => d.id === "b")?.text).toBe("B");
  });
});

describe("mergeFinalById", () => {
  it("зберігає раніше approved при частковому патчі (replace-reducer зітер би їх)", () => {
    const cur = [final("a", "approved"), final("b", "approved")];
    const next = mergeFinalById(cur, [final("b", "needs_revision")]);
    expect(next).toHaveLength(2);
    expect(next.find((f) => f.id === "a")?.status).toBe("approved"); // не зник
    expect(next.find((f) => f.id === "b")?.status).toBe("needs_revision"); // оновлено
  });
});

describe("addCost / costFromUsage / imageCost", () => {
  it("addCost акумулює cents і tokens", () => {
    expect(addCost({ cents: 1.5, tokens: 10 }, { cents: 2.5, tokens: 5 })).toEqual({
      cents: 4,
      tokens: 15,
    });
  });

  it("costFromUsage рахує НЕНУЛЬОВУ вартість з usage_metadata", () => {
    const c = costFromUsage(
      { input_tokens: 1000, output_tokens: 1000, total_tokens: 2000 },
      "gpt-4.1",
    );
    expect(c.tokens).toBe(2000);
    expect(c.cents).toBeGreaterThan(0);
  });

  it("costFromUsage толерантний до відсутнього usage (0, не кидає)", () => {
    expect(costFromUsage(undefined, "gpt-4.1")).toEqual({ cents: 0, tokens: 0 });
  });

  it("imageCost повертає фіксовану ненульову ціну, tokens=0", () => {
    const c = imageCost("gpt-image-1");
    expect(c.cents).toBeGreaterThan(0);
    expect(c.tokens).toBe(0);
  });
});
