// Unit — чернетка брифу з онбордингу. Цей вихід стає ДЖЕРЕЛОМ ПРАВДИ для fact-check, тож ціна
// помилки тут вища за звичайну: вигадана послуга перетвориться на «дозволений факт» у постах.
import { describe, expect, it } from "vitest";
import { draftBrandProfile, NotEnoughInputError } from "../../src/onboarding";
import { FakeModelFactory } from "../fixtures/fakeModel";

const FULL = {
  positioning: "  Інтеграційні сервіси для середнього бізнесу  ",
  stack: ["TypeScript", " Node.js ", "", "TypeScript"],
  services: ["CI/CD", "  "],
  audience: "CTO середніх компаній",
  toneOfVoice: "стримано-експертний",
  visualStyle: null,
  pillars: ["архітектура", "DevOps", ""],
};

function deps(response: unknown) {
  return { models: new FakeModelFactory({ researcher: response }) };
}

const base = { name: "Forteq", language: "uk", modelId: "gpt-5-nano" };

describe("draftBrandProfile", () => {
  it("не кличе модель, коли нема ні сайту, ні опису", async () => {
    // Без матеріалу модель вигадала б позиціювання з самої назви, і ця вигадка потрапила б у
    // бриф — тобто в джерело правди для fact-check. Порожній бриф чесніший за правдоподібний.
    const fake = new FakeModelFactory({ researcher: FULL });
    await expect(draftBrandProfile({ models: fake }, base)).rejects.toBeInstanceOf(
      NotEnoughInputError,
    );
    expect(fake.calls.researcher ?? []).toHaveLength(0);
  });

  it("достатньо самого опису", async () => {
    const { draft } = await draftBrandProfile(deps(FULL), {
      ...base,
      description: "робимо інтеграції",
    });
    expect(draft.positioning).toBe("Інтеграційні сервіси для середнього бізнесу");
  });

  it("прибирає порожні рядки й дублі з масивів", async () => {
    // Модель регулярно віддає [""] замість []; такий елемент рендериться порожнім чіпом,
    // який неможливо ні зрозуміти, ні прибрати.
    const { draft } = await draftBrandProfile(deps(FULL), { ...base, siteText: "про нас" });
    expect(draft.stack).toEqual(["TypeScript", "Node.js"]);
    expect(draft.services).toEqual(["CI/CD"]);
    expect(draft.pillars).toEqual(["архітектура", "DevOps"]);
  });

  it("порожній рядок у скалярному полі стає null, а не порожнім значенням", async () => {
    const { draft } = await draftBrandProfile(
      deps({ ...FULL, audience: "   ", toneOfVoice: "" }),
      { ...base, siteText: "про нас" },
    );
    expect(draft.audience).toBeNull();
    expect(draft.toneOfVoice).toBeNull();
  });

  it("обрізає надто довгий текст сайту перед викликом", async () => {
    // Далі йдуть навігація, футер і юридичні тексти — шум, що розмиває позиціювання і коштує грошей.
    const fake = new FakeModelFactory({ researcher: FULL });
    await draftBrandProfile({ models: fake }, { ...base, siteText: "x".repeat(20_000) });
    const prompt = (fake.calls.researcher ?? [])[0] ?? "";
    expect(prompt.length).toBeLessThan(12_000);
  });

  it("порожні масиви від моделі лишаються порожніми, а не падають", async () => {
    const { draft } = await draftBrandProfile(
      deps({ ...FULL, stack: [], services: [], pillars: [] }),
      { ...base, description: "щось" },
    );
    expect(draft.stack).toEqual([]);
    expect(draft.pillars).toEqual([]);
  });
});
