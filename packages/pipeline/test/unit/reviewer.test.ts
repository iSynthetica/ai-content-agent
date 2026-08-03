// Unit — Reviewer: determineStatus/averageScore (pure) + режим зі стану на фейку (§14, S11).
import { describe, expect, it } from "vitest";
import {
  averageScore,
  dedupeViolations,
  determineStatus,
  groundViolations,
  makeReviewerNode,
} from "../../src/agents/reviewer";
import type { GraphDeps } from "../../src/ports";
import type { ContentStateT } from "../../src/state";
import type { DraftItem, ReviewResult } from "../../src/schemas";
import { DEFAULT_MODELS } from "../../src/config";
import { FakeModelFactory } from "../fixtures/fakeModel";
import { company, meta } from "../fixtures/brief";

function scores(n: number): ReviewResult["scores"] {
  const c = { score: n, why: "reason ".repeat(4) };
  return { topicFit: c, toneAlignment: c, specificity: c, factualCoherence: c, channelFit: c };
}
const pass = { companyFactsInPost: [], factsInBrief: [], violations: [], verdict: "pass" as const };
const fail = { companyFactsInPost: [], factsInBrief: [], violations: ["fabricated"], verdict: "fail" as const };

describe("averageScore / determineStatus (§7.5)", () => {
  it("averageScore рахує середнє усіх критеріїв рубрики", () => {
    expect(averageScore(scores(4))).toBe(4);
  });
  it("topic-drift: topicFit<2 → flagged (як будь-який критерій<2)", () => {
    const s = { ...scores(5), topicFit: { score: 1, why: "пост про зовсім іншу тему, дрейф" } };
    expect(determineStatus(s, pass)).toBe("flagged");
  });
  it("averageScore толерантний до старих 4-критерійних станів (resume, без topicFit)", () => {
    const legacy = { ...scores(4) } as ReviewResult["scores"] & { topicFit?: unknown };
    delete legacy.topicFit;
    expect(averageScore(legacy as ReviewResult["scores"])).toBe(4);
  });
  it("fact-check fail → flagged", () => {
    expect(determineStatus(scores(5), fail)).toBe("flagged");
  });
  it("критерій<2 → flagged", () => {
    const s = { ...scores(5), specificity: { score: 1, why: "low quality writing here" } };
    expect(determineStatus(s, pass)).toBe("flagged");
  });
  it("avg<3 (усі 2, ніхто <2, pass) → needs_revision", () => {
    expect(determineStatus(scores(2), pass)).toBe("needs_revision");
  });
  it("високі бали + pass → approved", () => {
    expect(determineStatus(scores(5), pass)).toBe("approved");
  });
});

function draft(id: string, channel: DraftItem["channel"] = "linkedin"): DraftItem {
  return { id, planItemId: id, channel, topic: `Topic ${id}`, text: "Some text.", metadata: {}, revisionHistory: [] };
}
function baseState(overrides: Partial<ContentStateT>): ContentStateT {
  return {
    company,
    modelConfig: DEFAULT_MODELS,
    meta,
    drafts: [],
    final: [],
    cost: { cents: 0, tokens: 0 },
    errors: [],
    ...overrides,
  } as unknown as ContentStateT;
}
function depsWith(fake: FakeModelFactory): GraphDeps {
  return { models: fake } as unknown as GraphDeps;
}

const approvedReview = {
  scores: scores(4),
  factCheck: pass,
  hedgingIssues: [],
  violations: [],
  status: "approved",
};

describe("Reviewer node — режим зі стану", () => {
  it("initial (final порожній) рев'ює УСІ драфти; статус із determineStatus", async () => {
    const fake = new FakeModelFactory({ reviewer: approvedReview });
    const patch = await makeReviewerNode(depsWith(fake))(
      baseState({ drafts: [draft("a"), draft("b")] }),
    );
    expect(patch.final).toHaveLength(2);
    expect(patch.final?.every((f) => f.status === "approved")).toBe(true);
    expect((patch.cost?.cents ?? 0)).toBeGreaterThan(0);
  });

  it("revision (final непорожній) рев'ює ЛИШЕ needs_revision-набір, approved не чіпає", async () => {
    const fake = new FakeModelFactory({ reviewer: approvedReview });
    const prevFinal = [
      { id: "a", status: "needs_revision" } as never,
      { id: "b", status: "approved" } as never,
    ];
    const patch = await makeReviewerNode(depsWith(fake))(
      baseState({ drafts: [draft("a"), draft("b")], final: prevFinal }),
    );
    // Емітить final[] лише для "a" (b — approved, mergeFinalById збереже його поза нодою).
    expect(patch.final).toHaveLength(1);
    expect(patch.final?.[0].id).toBe("a");
  });

  it("fact-check fail → flagged (статус визначає КОД, не LLM-поле)", async () => {
    const fake = new FakeModelFactory({
      reviewer: { ...approvedReview, factCheck: fail, status: "flagged" },
    });
    const patch = await makeReviewerNode(depsWith(fake))(
      baseState({ drafts: [draft("ig", "instagram")] }),
    );
    expect(patch.final?.[0].status).toBe("flagged");
  });
});

// Запобіжник якості (§7.5): порушення без цитати з тексту — недійсне. Через це «flagged» знову
// щось означає: раніше модель писала у violations «none» / «Немає явних порушень…», і майже
// кожен пост позначався проблемним.
describe("groundViolations — порушення мусить цитувати текст", () => {
  const POST = "Ми будуємо сервіси на TypeScript. Можливо, це підійде вам. Зростання 40% за рік.";

  it("цитата є в тексті → порушення лишається", () => {
    const out = groundViolations([{ quote: "Зростання 40% за рік", issue: "немає джерела" }], POST);
    expect(out).toHaveLength(1);
  });

  it("опис ВІДСУТНОСТІ порушень відкидається (немає що цитувати)", () => {
    const out = groundViolations(
      [
        { quote: "Немає явних порушень фактичної інформації з brief.", issue: "-" },
        { quote: "none", issue: "" },
        { quote: "-", issue: "" },
      ],
      POST,
    );
    expect(out).toEqual([]);
  });

  it("СПРАВЖНЄ порушення, сформульоване через заперечення, НЕ відкидається", () => {
    // Саме цей кейс ламав би блокліст фраз («немає…» → відкинути): проблема реальна,
    // а прив'язка доводиться цитатою, не формулюванням.
    const out = groundViolations([{ quote: "40%", issue: "немає джерела для цифри" }], POST);
    expect(out).toHaveLength(1);
  });

  it("вигадана моделлю цитата відкидається", () => {
    const out = groundViolations([{ quote: "ми обслуговуємо 500 клієнтів", issue: "вигадка" }], POST);
    expect(out).toEqual([]);
  });

  it("занадто коротка цитата відкидається (випадковий збіг)", () => {
    const out = groundViolations([{ quote: "ми", issue: "щось" }], POST);
    expect(out).toEqual([]);
  });

  it("толерує розбіжності регістру, лапок і пробілів", () => {
    const out = groundViolations([{ quote: "«МОЖЛИВО,   це   підійде»", issue: "hedging" }], POST);
    expect(out).toHaveLength(1);
  });
});

describe("dedupeViolations", () => {
  it("прибирає повтори того самого порушення з різних джерел", () => {
    const out = dedupeViolations([
      { quote: "можливо", issue: "hedging" },
      { quote: "Можливо", issue: "Hedging" },
      { quote: "40%", issue: "немає джерела" },
    ]);
    expect(out).toHaveLength(2);
  });
});
