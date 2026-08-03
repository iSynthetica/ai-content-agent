// Unit — Writer: per-channel initial, ізоляція помилок→errors[], revision (join до плану,
// revisionHistory, інвалідація IG-візуалу, людський note доходить до промпту) (§14, S9).
import { describe, expect, it } from "vitest";
import { makeWriterNode } from "../../src/agents/writer";
import type { GraphDeps } from "../../src/ports";
import type { ContentStateT } from "../../src/state";
import type { ContentPlanItem, FinalItem } from "../../src/schemas";
import { DEFAULT_MODELS } from "../../src/config";
import { FakeModelFactory } from "../fixtures/fakeModel";
import { company, meta } from "../fixtures/brief";

const writerResponder = (input: string) =>
  input.includes("РЕВІЗІЯ")
    ? { text: "REVISED draft text", imagePromptSuggestion: "img", metaDescription: "meta" }
    : { text: "Initial draft.", imagePromptSuggestion: "img", metaDescription: "meta" };

function plan(id: string, channel: ContentPlanItem["channel"]): ContentPlanItem {
  return { id, topic: `Topic ${id}`, channel, format: "f", keyMessage: "km", seoKeywords: [] };
}
function baseState(overrides: Partial<ContentStateT>): ContentStateT {
  return {
    company,
    modelConfig: DEFAULT_MODELS,
    meta,
    research: { sources: [], nicheTopics: [] } as never,
    contentPlan: [],
    drafts: [],
    final: [],
    revisionCount: 0,
    cost: { cents: 0, tokens: 0 },
    errors: [],
    ...overrides,
  } as unknown as ContentStateT;
}
function depsWith(fake: FakeModelFactory): GraphDeps {
  return { models: fake } as unknown as GraphDeps;
}

describe("Writer — initial", () => {
  it("пише усі елементи; draft.id===plan.id; per-channel метадані", async () => {
    const fake = new FakeModelFactory({ writer: writerResponder });
    const patch = await makeWriterNode(depsWith(fake), "initial")(
      baseState({
        contentPlan: [plan("li", "linkedin"), plan("ig", "instagram"), plan("bl", "blog")],
      }),
    );
    expect(patch.drafts).toHaveLength(3);
    const byId = Object.fromEntries((patch.drafts ?? []).map((d) => [d.id, d]));
    expect(byId.li.planItemId).toBe("li"); // ІНВАРІАНТ id===planItemId
    expect(byId.ig.metadata.imagePromptSuggestion).toBe("img"); // тільки instagram
    expect(byId.bl.metadata.metaDescription).toBe("meta"); // тільки blog
    expect(byId.li.metadata.imagePromptSuggestion).toBeUndefined();
    expect(byId.li.metadata.wordCount).toBeGreaterThan(0);
    expect(patch.errors).toEqual([]);
  });

  // Проводка angle (Phase 2): акцент кампанії (per-run) мусить дійти до промпту writer'а —
  // раніше зберігався й показувався, але генерацію не чіпав (shim).
  it("акцент кампанії (campaignAngle) доходить до промпту writer'а", async () => {
    const fake = new FakeModelFactory({ writer: writerResponder });
    await makeWriterNode(depsWith(fake), "initial")(
      baseState({
        company: { ...company, campaignAngle: "Запуск тарифу Enterprise" },
        contentPlan: [plan("li", "linkedin")],
      }),
    );
    expect(fake.calls.writer[0]).toContain("АКЦЕНТ КАМПАНІЇ");
    expect(fake.calls.writer[0]).toContain("Запуск тарифу Enterprise");
  });

  it("без campaignAngle — жодної директиви акценту в промпті (без шуму)", async () => {
    const fake = new FakeModelFactory({ writer: writerResponder });
    await makeWriterNode(depsWith(fake), "initial")(
      baseState({ contentPlan: [plan("li", "linkedin")] }),
    );
    expect(fake.calls.writer[0]).not.toContain("АКЦЕНТ КАМПАНІЇ");
  });

  it("ізоляція помилок per-item → errors[] (впалий пост не валить прогін)", async () => {
    const responder = (input: string) => {
      if (input.includes("Topic bad")) throw new Error("boom");
      return { text: "ok" };
    };
    const fake = new FakeModelFactory({ writer: responder });
    const patch = await makeWriterNode(depsWith(fake), "initial")(
      baseState({ contentPlan: [plan("good", "linkedin"), plan("bad", "linkedin")] }),
    );
    expect(patch.drafts).toHaveLength(1);
    expect(patch.drafts?.[0].id).toBe("good");
    expect(patch.errors).toHaveLength(1);
    expect(patch.errors?.[0]).toContain("bad");
  });
});

describe("Writer — revision", () => {
  function feedbackFinal(id: string, note: string | null): FinalItem {
    return {
      id,
      planItemId: id,
      channel: "instagram",
      text: "old text",
      metadata: {},
      revisionHistory: [],
      scores: {
        toneAlignment: { score: 2, why: "потрібно більше конкретики тут будь ласка" },
        specificity: { score: 2, why: "потрібно більше конкретики тут будь ласка" },
        factualCoherence: { score: 4, why: "факти узгоджені з brief загалом добре нині" },
        channelFit: { score: 3, why: "формат каналу переважно дотримано вами добре" },
      },
      factCheck: { companyFactsInPost: [], factsInBrief: [], violations: [], verdict: "pass" },
      violations: ["too generic"],
      status: "needs_revision",
      revisionNote: note,
    };
  }

  it("переписує лише needs_revision; join до плану; revisionHistory; інвалідація IG-візуалу; +revisionCount", async () => {
    const fake = new FakeModelFactory({ writer: writerResponder });
    const patch = await makeWriterNode(depsWith(fake), "revision")(
      baseState({
        contentPlan: [plan("ig", "instagram"), plan("li", "linkedin")],
        final: [feedbackFinal("ig", "додай конкретну цифру")],
        revisionCount: 0,
      }),
    );
    expect(patch.drafts).toHaveLength(1); // лише needs_revision "ig"
    const d = patch.drafts?.[0];
    expect(d?.id).toBe("ig");
    expect(d?.text).toBe("REVISED draft text");
    expect(d?.revisionHistory).toEqual(["old text"]); // попередній текст у історію
    expect(patch.revisionCount).toBe(1); // авто-лічильник +1

    // Людський note дійшов до промпту Writer'а.
    const writerPrompts = fake.calls.writer ?? [];
    expect(writerPrompts.some((p) => p.includes("додай конкретну цифру"))).toBe(true);
  });
});
