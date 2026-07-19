// Unit — rule-based перевірки (§12.1, S7). Good/bad post per channel; параметризовано.
import { describe, expect, it } from "vitest";
import {
  ctaCheck,
  forbiddenCategorical,
  genericPhrasesFilter,
  hashtagCount,
  hedgingCheck,
  keywordDensity,
  lengthCheck,
  runAllChecks,
  structureCheck,
} from "../src/ruleBased";

describe("lengthCheck", () => {
  it("blog: >=300 слів passed, короткий failed", () => {
    const long = Array(320).fill("word").join(" ");
    expect(lengthCheck({ channel: "blog", text: long }).passed).toBe(true);
    expect(lengthCheck({ channel: "blog", text: "short post" }).passed).toBe(false);
  });
  it("linkedin: у межах 200..3000 символів passed, надто короткий failed", () => {
    expect(lengthCheck({ channel: "linkedin", text: "x".repeat(500) }).passed).toBe(true);
    expect(lengthCheck({ channel: "linkedin", text: "hi" }).passed).toBe(false);
  });
  it("twitter: блок >280 символів failed", () => {
    expect(lengthCheck({ channel: "twitter", text: "a".repeat(300) }).passed).toBe(false);
    expect(lengthCheck({ channel: "twitter", text: "ok tweet" }).passed).toBe(true);
  });
});

describe("structureCheck", () => {
  it("blog з H2 passed, без — failed", () => {
    expect(structureCheck({ channel: "blog", text: "## Розділ\nтекст" }).passed).toBe(true);
    expect(structureCheck({ channel: "blog", text: "просто текст" }).passed).toBe(false);
  });
  it("twitter 3..5 блоків passed", () => {
    const thread = "t1\n\nt2\n\nt3";
    expect(structureCheck({ channel: "twitter", text: thread }).passed).toBe(true);
    expect(structureCheck({ channel: "twitter", text: "один блок" }).passed).toBe(false);
  });
});

describe("hashtagCount (instagram)", () => {
  it("5..15 хештегів passed", () => {
    const good = "caption " + Array(6).fill(0).map((_, i) => `#tag${i}`).join(" ");
    expect(hashtagCount({ channel: "instagram", text: good }).passed).toBe(true);
  });
  it("замало хештегів failed", () => {
    expect(hashtagCount({ channel: "instagram", text: "caption #one #two" }).passed).toBe(false);
  });
  it("n/a для не-instagram", () => {
    expect(hashtagCount({ channel: "linkedin", text: "no tags" }).passed).toBe(true);
  });
});

describe("forbiddenCategorical (Type 3)", () => {
  it("категоричні абсолюти failed", () => {
    const r = forbiddenCategorical({ channel: "linkedin", text: "Ми завжди гарантовано найкращі" });
    expect(r.passed).toBe(false);
    expect(r.details).toMatch(/завжди|гарантовано|найкращ/);
  });
  it("нейтральний текст passed", () => {
    expect(forbiddenCategorical({ channel: "linkedin", text: "Ми допомагаємо командам" }).passed).toBe(
      true,
    );
  });
});

describe("hedgingCheck (Type 3)", () => {
  it("надмірний hedging failed", () => {
    const r = hedgingCheck({
      channel: "linkedin",
      text: "можливо мабуть ймовірно здається начебто це спрацює",
    });
    expect(r.passed).toBe(false);
  });
  it("впевнений текст passed", () => {
    expect(hedgingCheck({ channel: "linkedin", text: "Ми будуємо надійні рішення" }).passed).toBe(
      true,
    );
  });
});

describe("ctaCheck / genericPhrasesFilter", () => {
  it("CTA присутній", () => {
    expect(ctaCheck({ channel: "linkedin", text: "Зв'яжіться з нами сьогодні" }).passed).toBe(true);
  });
  it("маркетинг-кліше знижують score", () => {
    const r = genericPhrasesFilter({
      channel: "linkedin",
      text: "Our cutting-edge synergy is world-class",
    });
    expect(r.passed).toBe(false);
    expect(r.score).toBeLessThan(1);
  });
});

describe("keywordDensity (blog)", () => {
  it("ключ у межах 1..2% passed", () => {
    const body = Array(200).fill("текст").join(" ");
    const withKw = `devops ${body} devops`; // ~1%
    const r = keywordDensity({ channel: "blog", text: withKw, seoKeywords: ["devops"] });
    expect(r.passed).toBe(true);
  });
  it("без ключів — n/a passed", () => {
    expect(keywordDensity({ channel: "blog", text: "текст", seoKeywords: [] }).passed).toBe(true);
  });
});

describe("runAllChecks", () => {
  it("повертає 9 перевірок", () => {
    expect(runAllChecks({ channel: "linkedin", text: "Хороший пост. Зв'яжіться з нами." })).toHaveLength(
      9,
    );
  });
});
