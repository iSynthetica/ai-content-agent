// Unit — llm-judge (§12.2, S14) на фейку: structured і fallback-шляхи повертають валідний JudgeResult.
import { describe, expect, it } from "vitest";
import { judgePost, type JudgeResult } from "../src/llmJudge";

const canned: JudgeResult = {
  scores: { toneAlignment: 4, specificity: 3, factualCoherence: 5, channelFit: 4 },
  rationale: "адекватно",
  verdict: "pass",
};

describe("judgePost", () => {
  it("використовує withStructuredOutput, якщо модель його підтримує", async () => {
    const model = {
      withStructuredOutput() {
        return { async invoke() { return canned; } };
      },
      async invoke() {
        throw new Error("should not be called");
      },
    };
    const res = await judgePost(model, { post: "текст", brief: { name: "X" }, channel: "linkedin" });
    expect(res.verdict).toBe("pass");
    expect(res.scores.factualCoherence).toBe(5);
  });

  it("fallback: парсить JSON із текстової відповіді, якщо withStructuredOutput немає", async () => {
    const model = {
      async invoke() {
        return { content: JSON.stringify(canned) };
      },
    };
    const res = await judgePost(model, { post: "текст", brief: {}, channel: "blog" });
    expect(res.scores.toneAlignment).toBe(4);
  });

  it("валідує вихід схемою (кидає на невалідному балі)", async () => {
    const bad = { ...canned, scores: { ...canned.scores, toneAlignment: 9 } };
    const model = {
      withStructuredOutput() {
        return { async invoke() { return bad; } };
      },
      async invoke() {
        return "";
      },
    };
    await expect(
      judgePost(model, { post: "t", brief: {}, channel: "twitter" }),
    ).rejects.toThrow();
  });
});
