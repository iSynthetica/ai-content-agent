// Фреймворк-шлях OAuth-обміну (§publishing foundation §3, master-plan §2). Поважає per-provider
// варіації: tokenAuth (basic vs params), PKCE (code_verifier), scope-роздільник (у buildAuthParams).
// Ці функції — ЧИСТІ щодо БД (лише HTTP): їх кличе контролер ПОЗА транзакцією (hard-boundary #4 —
// не тримати txn під час зовнішнього HTTP).
import type { OAuthProviderConfig, ParsedTokenResponse, PkcePair } from "./types";

// Будує authorize-URL. Свідомо НЕ хардкодимо space-join scope: кожен провайдер збирає власний
// query (включно зі scope-рядком) у buildAuthParams (master-plan §2 п.3).
export function buildAuthorizeUrl(
  cfg: OAuthProviderConfig,
  state: string,
  pkce?: PkcePair,
): string {
  const url = new URL(cfg.authorizeUrl);
  for (const [key, value] of Object.entries(cfg.buildAuthParams(state, pkce))) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}

// Спільний POST на token-ендпоінт. tokenAuth="basic" → Authorization: Basic base64(id:secret)
// (X/Twitter); інакше client_id/secret у тілі форми (LinkedIn/IG). За замовчуванням — "params".
async function postToken(
  cfg: OAuthProviderConfig,
  body: Record<string, string>,
): Promise<ParsedTokenResponse> {
  const form = new URLSearchParams(body);
  const headers: Record<string, string> = {
    "content-type": "application/x-www-form-urlencoded",
    accept: "application/json",
  };

  if (cfg.tokenAuth === "basic") {
    const basic = Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString("base64");
    headers.authorization = `Basic ${basic}`;
  } else {
    form.set("client_id", cfg.clientId);
    form.set("client_secret", cfg.clientSecret);
  }

  const res = await fetch(cfg.tokenUrl, { method: "POST", headers, body: form.toString() });
  if (!res.ok) {
    // Тіло помилки лишаємо в повідомленні (обрізане) — щоб «invalid_grant» тощо було видно в логах,
    // але без витоку токенів (їх на цьому кроці ще нема).
    const text = await res.text().catch(() => "");
    throw new Error(`OAuth token endpoint responded ${res.status}: ${text.slice(0, 300)}`);
  }
  const json: unknown = await res.json();
  return cfg.parseTokenResponse(json);
}

// code → tokens. PKCE-verifier передається лише коли провайдер його використовує.
export function exchangeCode(
  cfg: OAuthProviderConfig,
  code: string,
  pkceVerifier?: string,
): Promise<ParsedTokenResponse> {
  const body: Record<string, string> = {
    grant_type: "authorization_code",
    code,
    redirect_uri: cfg.redirectUri,
  };
  if (pkceVerifier) body.code_verifier = pkceVerifier;
  return postToken(cfg, body);
}

// refresh_token → новий access (X/LinkedIn). IG long-lived не рефрешиться grant'ом — адаптер сам.
export function refreshAccessToken(
  cfg: OAuthProviderConfig,
  refreshToken: string,
): Promise<ParsedTokenResponse> {
  return postToken(cfg, { grant_type: "refresh_token", refresh_token: refreshToken });
}
