// PKCE (RFC 7636, S256) — X/Twitter вимагає (master-plan §2 п.1). Чисті функції, без стану:
// verifier генерується на authorize, кладеться у state-cookie й повертається на callback до exchange.
import { createHash, randomBytes } from "node:crypto";
import type { PkcePair } from "./types";

// verifier — 32 випадкові байти у base64url = 43 символи (у дозволеному діапазоні 43-128).
// challenge = base64url(sha256(verifier)). base64url без '=' padding — вимога специфікації.
export function generatePkce(): PkcePair {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

// Непрогнозований state (CSRF-токен) — 16 байт base64url. Зберігається у cookie, звіряється з
// query-параметром на callback.
export function generateState(): string {
  return randomBytes(16).toString("base64url");
}
