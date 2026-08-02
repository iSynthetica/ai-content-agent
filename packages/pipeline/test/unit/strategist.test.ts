// Unit — Strategist: dedup (pure) + повний/скоупнутий режими на фейковій моделі (§14, S8/S17).
import { describe, expect, it } from "vitest";
import { capPerChannel, deduplicateTopics, makeStrategistNode } from "../../src/agents/strategist";
import type { GraphDeps } from "../../src/ports";
import type { ContentStateT } from "../../src/state";
import { DEFAULT_MODELS } from "../../src/config";
import { FakeModelFactory } from "../fixtures/fakeModel";
import { company, meta } from "../fixtures/brief";

describe("capPerChannel (§spec 08 — exact counts)", () => {
  const items = [
    { channel: "linkedin", topic: "a" },
    { channel: "linkedin", topic: "b" },
    { channel: "linkedin", topic: "c" },
    { channel: "blog", topic: "d" },
  ];
  it("обрізає кожен канал до запитаної к-сті", () => {
    const out = capPerChannel(items, { linkedin: 2, blog: 1 });
    expect(out.filter((i) => i.channel === "linkedin")).toHaveLength(2);
    expect(out.filter((i) => i.channel === "blog")).toHaveLength(1);
  });
  it("канал без ліміту в counts лишається як є", () => {
    expect(capPerChannel(items, { blog: 1 })).toHaveLength(4); // 3 linkedin (без ліміту) + 1 blog→1
  });
  it("undefined counts → без змін", () => {
    expect(capPerChannel(items, undefined)).toHaveLength(4);
  });
});

function baseState(overrides: Partial<ContentStateT>): ContentStateT {
  return {
    company,
    channelConfig: { linkedin: 2, instagram: 1 },
    planScope: null,
    modelConfig: DEFAULT_MODELS,
    meta,
    research: undefined,
    contentPlan: [],
    drafts: [],
    final: [],
    revisionCount: 0,
    humanRevisionCount: 0,
    cost: { cents: 0, tokens: 0 },
    errors: [],
    humanDecision: null,
    ...overrides,
  } as unknown as ContentStateT;
}

function depsWith(fake: FakeModelFactory): GraphDeps {
  return { models: fake } as unknown as GraphDeps;
}

describe("deduplicateTopics (FR-3.3)", () => {
  it("прибирає повтори тем across channels, лишає перше входження", () => {
    const out = deduplicateTopics([
      { topic: "AI in DevOps" },
      { topic: "ai in devops" }, // дубль (регістр/пробіли)
      { topic: "Legacy migration" },
    ]);
    expect(out).toHaveLength(2);
    expect(out.map((x) => x.topic)).toEqual(["AI in DevOps", "Legacy migration"]);
  });
});

describe("Strategist — повний режим", () => {
  it("генерує plan з id (код, не LLM) і унікальними темами", async () => {
    const fake = new FakeModelFactory({
      strategist: {
        items: [
          { topic: "A", channel: "linkedin", format: "post", keyMessage: "ka", seoKeywords: [] },
          { topic: "A", channel: "twitter", format: "thread", keyMessage: "ka2", seoKeywords: [] }, // дубль теми
          { topic: "B", channel: "instagram", format: "caption", keyMessage: "kb", seoKeywords: [] },
        ],
      },
    });
    const patch = await makeStrategistNode(depsWith(fake))(baseState({}));
    expect(patch.contentPlan).toHaveLength(2); // дубль "A" прибрано
    for (const item of patch.contentPlan ?? []) {
      expect(item.id).toBeTruthy();
      expect(typeof item.id).toBe("string");
    }
    expect((patch.cost?.cents ?? 0)).toBeGreaterThan(0);
  });
});

describe("Strategist — скоупнутий режим", () => {
  const scope = [
    { id: "entry-1", channel: "linkedin" as const, topic: "Fixed A", keyMessage: "km1", seoKeywords: ["k"] },
    { id: "entry-2", channel: "blog" as const, topic: "Fixed B", keyMessage: "km2" },
  ];

  it("усі keyMessage задані → 0 LLM-викликів, cost=0, id===planEntry.id (провенанс)", async () => {
    const fake = new FakeModelFactory({});
    const patch = await makeStrategistNode(depsWith(fake))(baseState({ planScope: scope as never }));
    expect(fake.calls.strategist ?? []).toHaveLength(0); // повний skip
    expect(patch.cost).toEqual({ cents: 0, tokens: 0 });
    expect(patch.contentPlan?.map((p) => p.id)).toEqual(["entry-1", "entry-2"]);
    expect(patch.contentPlan?.map((p) => p.topic)).toEqual(["Fixed A", "Fixed B"]); // теми не перегенеровані
  });

  it("відсутній keyMessage → рівно 1 LLM-виклик для дозаповнення, id збережено", async () => {
    const partial = [
      { id: "e1", channel: "linkedin" as const, topic: "T1", keyMessage: "has" },
      { id: "e2", channel: "linkedin" as const, topic: "T2" }, // без keyMessage
    ];
    const fake = new FakeModelFactory({
      strategist: { items: [{ id: "e2", format: "post", keyMessage: "filled-km" }] },
    });
    const patch = await makeStrategistNode(depsWith(fake))(
      baseState({ planScope: partial as never }),
    );
    expect(fake.calls.strategist ?? []).toHaveLength(1);
    expect(patch.contentPlan?.map((p) => p.id)).toEqual(["e1", "e2"]);
    expect(patch.contentPlan?.find((p) => p.id === "e2")?.keyMessage).toBe("filled-km");
  });
});
