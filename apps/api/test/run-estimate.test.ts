// Unit — estimateRunCost (Phase 4 пре-ран оцінка, @forteq/shared). Фіксуємо модель масштабування,
// яка інакше тихо попливе: researcher/strategist — на прогін, writer/reviewer — на пост, картинки —
// на instagram-пост; judge (офлайн) у вартість не входить. Це ОЦІНКА, тож перевіряємо
// співвідношення й межі, а не точні центи.
import { describe, expect, it } from "vitest";
import { EXPENSIVE_RUN_CENTS, estimateRunCost } from "@forteq/shared";

const NANO = {
  researcher: "gpt-5-nano",
  strategist: "gpt-5-nano",
  writer: "gpt-5-nano",
  reviewer: "gpt-5-nano",
};

describe("estimateRunCost", () => {
  it("вартість зростає з кількістю постів", () => {
    const few = estimateRunCost({ totalPosts: 2, imageCount: 0, roleModels: NANO });
    const many = estimateRunCost({ totalPosts: 10, imageCount: 0, roleModels: NANO });
    expect(many.cents).toBeGreaterThan(few.cents);
    expect(many.posts).toBe(10);
  });

  it("кожен instagram-пост додає фіксовану ціну картинки (gpt-image-1 = 4¢)", () => {
    const noImg = estimateRunCost({ totalPosts: 5, imageCount: 0, roleModels: NANO });
    const withImg = estimateRunCost({ totalPosts: 5, imageCount: 3, roleModels: NANO });
    expect(withImg.imageCents - noImg.imageCents).toBe(12); // 3 × 4¢
    expect(withImg.images).toBe(3);
  });

  it("сильніші моделі дорожчі за nano на тому самому конфігу", () => {
    const opus = {
      researcher: "claude-opus-4-8",
      strategist: "claude-opus-4-8",
      writer: "claude-opus-4-8",
      reviewer: "claude-opus-4-8",
    };
    const cheap = estimateRunCost({ totalPosts: 8, imageCount: 0, roleModels: NANO });
    const pricey = estimateRunCost({ totalPosts: 8, imageCount: 0, roleModels: opus });
    expect(pricey.textCents).toBeGreaterThan(cheap.textCents * 5);
  });

  it("expensive прапорець піднімається за порогом (дорогі моделі × багато постів)", () => {
    const opus = {
      researcher: "claude-opus-4-8",
      strategist: "claude-opus-4-8",
      writer: "claude-opus-4-8",
      reviewer: "claude-opus-4-8",
    };
    const big = estimateRunCost({ totalPosts: 20, imageCount: 20, roleModels: opus });
    expect(big.cents).toBeGreaterThanOrEqual(EXPENSIVE_RUN_CENTS);
    expect(big.expensive).toBe(true);
    const small = estimateRunCost({ totalPosts: 1, imageCount: 0, roleModels: NANO });
    expect(small.expensive).toBe(false);
  });
});
