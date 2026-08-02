// Резолв per-slot моделі (§ADR-0017): slotModel (override vs фолбек) і textProvidersUsed (union
// для BYOK). Чисті функції на шві — помилка тут або білить не ту модель, або пропускає потрібний
// ключ повз union-перевірку; жодне не видно з типів.
import { describe, expect, it } from "vitest";
import { slotModel, textProvidersUsed, type ModelConfig } from "../../src/config";

const base: ModelConfig = {
  provider: "openai",
  models: {
    researcher: "gpt-5-nano",
    strategist: "gpt-5-nano",
    writer: "gpt-5-nano",
    reviewer: "gpt-5-nano",
    judge: "gpt-5-nano",
    visual: "gpt-image-1",
  },
};

describe("slotModel", () => {
  it("падає на фолбек provider+model, коли override відсутній", () => {
    expect(slotModel(base, "writer")).toEqual({ provider: "openai", model: "gpt-5-nano" });
  });

  it("override виграє над фолбеком для свого слота", () => {
    const cfg: ModelConfig = { ...base, agentModels: { writer: { provider: "anthropic", model: "claude-opus-4-8" } } };
    expect(slotModel(cfg, "writer")).toEqual({ provider: "anthropic", model: "claude-opus-4-8" });
    // не перевизначений слот лишається на фолбеку
    expect(slotModel(cfg, "reviewer")).toEqual({ provider: "openai", model: "gpt-5-nano" });
  });
});

describe("textProvidersUsed", () => {
  it("легасі-конфіг (без agentModels) → лише базовий провайдер", () => {
    expect(textProvidersUsed(base)).toEqual(["openai"]);
  });

  it("union провайдерів по ролях, без дублів, БЕЗ visual", () => {
    const cfg: ModelConfig = {
      ...base,
      agentModels: {
        researcher: { provider: "gemini", model: "gemini-2.0-flash" },
        writer: { provider: "anthropic", model: "claude-opus-4-8" },
        // reviewer/strategist/judge лишаються на openai (фолбек)
      },
    };
    const used = textProvidersUsed(cfg).sort();
    expect(used).toEqual(["anthropic", "gemini", "openai"]);
  });

  it("override усіх текстових слотів на один не-базовий провайдер → лише він", () => {
    const cfg: ModelConfig = {
      ...base,
      agentModels: {
        researcher: { provider: "gemini", model: "gemini-2.0-flash" },
        strategist: { provider: "gemini", model: "gemini-2.5-flash" },
        writer: { provider: "gemini", model: "gemini-2.5-pro" },
        reviewer: { provider: "gemini", model: "gemini-2.5-flash" },
        judge: { provider: "gemini", model: "gemini-2.5-pro" },
      },
    };
    expect(textProvidersUsed(cfg)).toEqual(["gemini"]);
  });
});
