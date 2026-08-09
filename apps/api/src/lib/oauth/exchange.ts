// Фреймворк-шлях OAuth-обміну (§publishing foundation §3, master-plan §2). Поважає per-provider
// варіації: tokenAuth (basic vs params), PKCE (code_verifier), scope-роздільник (у buildAuthParams).
// Ці функції — ЧИСТІ щодо БД (лише HTTP): їх кличе контролер ПОЗА транзакцією (hard-boundary #4 —
// не тримати txn під час зовнішнього HTTP).
import type { OAuthCreds, OAuthProviderConfig, ParsedTokenResponse, PkcePair } from "./types";

// Будує authorize-URL. Свідомо НЕ хардкодимо space-join scope: кожен провайдер збирає власний
// query (включно зі scope-рядком) у buildAuthParams (master-plan §2 п.3). clientId — per-request
// (креди орендаря/env), тож приходить аргументом, а не з конфіга.
export function buildAuthorizeUrl(
  cfg: OAuthProviderConfig,
  clientId: string,
  state: string,
  pkce?: PkcePair,
): string {
  const url = new URL(cfg.authorizeUrl);
  for (const [key, value] of Object.entries(cfg.buildAuthParams(clientId, state, pkce))) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}

// Спільний POST на token-ендпоінт. tokenAuth="basic" → Authorization: Basic base64(id:secret)
// (X/Twitter); інакше client_id/secret у тілі форми (LinkedIn/IG). За замовчуванням — "params".
// creds — per-request (креди орендаря або env-fallback), а не з конфіга (BYO-app).
async function postToken(
  cfg: OAuthProviderConfig,
  creds: OAuthCreds,
  body: Record<string, string>,
): Promise<ParsedTokenResponse> {
  const form = new URLSearchParams(body);
  const headers: Record<string, string> = {
    "content-type": "application/x-www-form-urlencoded",
    accept: "application/json",
  };

  if (cfg.tokenAuth === "basic") {
    const basic = Buffer.from(`${creds.clientId}:${creds.clientSecret}`).toString("base64");
    headers.authorization = `Basic ${basic}`;
  } else {
    form.set("client_id", creds.clientId);
    form.set("client_secret", creds.clientSecret);
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

// code → tokens. PKCE-verifier передається лише коли провайдер його використовує. creds — per-request.
export function exchangeCode(
  cfg: OAuthProviderConfig,
  creds: OAuthCreds,
  code: string,
  pkceVerifier?: string,
): Promise<ParsedTokenResponse> {
  const body: Record<string, string> = {
    grant_type: "authorization_code",
    code,
    redirect_uri: cfg.redirectUri,
  };
  if (pkceVerifier) body.code_verifier = pkceVerifier;
  return postToken(cfg, creds, body);
}

// refresh_token → новий access (X/LinkedIn). IG long-lived не рефрешиться grant'ом — адаптер сам.
// creds — per-request (креди орендаря або env-fallback).
export function refreshAccessToken(
  cfg: OAuthProviderConfig,
  creds: OAuthCreds,
  refreshToken: string,
): Promise<ParsedTokenResponse> {
  return postToken(cfg, creds, { grant_type: "refresh_token", refresh_token: refreshToken });
}
