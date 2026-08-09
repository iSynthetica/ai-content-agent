// Unit — PKCE-хелпер (§publishing, master-plan §2 п.1). Ламається мовчки: неправильна довжина
// verifier або невідповідність challenge=base64url(sha256(verifier)) — і X/Twitter відхиляє exchange
// уже в проді. Тому перевіряємо саме інваріанти специфікації RFC 7636 (S256).
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { generatePkce, generateState } from "../src/lib/oauth/pkce";

describe("generatePkce", () => {
  it("verifier у дозволеному діапазоні 43-128 і лише base64url-символи", () => {
    const { verifier } = generatePkce();
    expect(verifier.length).toBeGreaterThanOrEqual(43);
    expect(verifier.length).toBeLessThanOrEqual(128);
    expect(verifier).toMatch(/^[A-Za-z0-9\-_]+$/); // base64url, без '=' padding
  });

  it("challenge = base64url(sha256(verifier)) — S256", () => {
    const { verifier, challenge } = generatePkce();
    const expected = createHash("sha256").update(verifier).digest("base64url");
    expect(challenge).toBe(expected);
  });

  it("кожен виклик дає новий verifier (непрогнозованість)", () => {
    expect(generatePkce().verifier).not.toBe(generatePkce().verifier);
  });
});

describe("generateState", () => {
  it("непорожній і унікальний між викликами", () => {
    const a = generateState();
    const b = generateState();
    expect(a.length).toBeGreaterThan(0);
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9\-_]+$/);
  });
});
