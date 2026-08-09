// OAuth-фреймворк (§publishing foundation §3, master-plan §2). ОДИН code-path на три соцмережі;
// відрізняється лише per-provider конфіг (OAuthProviderConfig). Адаптер-фази (linkedin/twitter/
// instagram) постачають по одному запису в реєстр (providers.ts) — фреймворк не чіпають.
import type { PublishProvider } from "@forteq/shared";

// Реекспорт — щоб адаптери тягли тип провайдера з одного місця (lib/oauth), а не з @forteq/shared.
export type { PublishProvider };

// PKCE-пара (X/Twitter вимагає S256). Фреймворк генерує verifier+challenge, зберігає verifier у
// state-cookie і шле challenge на authorize, а verifier — на token-exchange (master-plan §2 п.1).
export interface PkcePair {
  verifier: string; // code_verifier (43-128 символів)
  challenge: string; // code_challenge = base64url(sha256(verifier))
}

// Нормалізована відповідь token-ендпоінта (кожен провайдер парсить свою сиру форму сам).
export interface ParsedTokenResponse {
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number; // секунди до протухання access-токена
  scope?: string; // надані scope як прийшли (пробіл/кома — залежить від провайдера)
}

// Кого ми підключили. tokenOverride (Instagram, master-plan §2 п.4): OAuth дає user-токен, але
// ПУБЛІКУЄ дериватив (Page access token) — коли він є, фреймворк кладе САМЕ його в access_token_ct.
export interface AccountIdentity {
  id: string; // URN / user id / page id
  name: string; // людська назва акаунта
  meta?: Record<string, unknown>; // провайдер-специфіка (ig-user-id, org URN тощо)
  tokenOverride?: string; // якщо заданий — зберігається як access_token (замість OAuth-токена)
}

// Конфіг одного провайдера. Усе, чим соцмережі різняться, — тут; решта коду параметрична.
export interface OAuthProviderConfig {
  authorizeUrl: string; // consent-ендпоінт
  tokenUrl: string; // code → token
  scopes: string[]; // запитувані scope
  clientId: string; // з env (адаптер-фаза); НІКОЛИ не хардкод
  clientSecret: string; // з env (адаптер-фаза)
  redirectUri: string; // зареєстрований у провайдера redirect (через web-BFF → api callback)
  usesPkce?: boolean; // X/Twitter — true
  tokenAuth?: "params" | "basic"; // LinkedIn/IG — params (creds у тілі); X — basic (Authorization)
  // Будує query authorize-URL. scope-роздільник — тут (LinkedIn/X пробіл, FB/IG кома): фреймворк
  // НЕ join'ить сам (master-plan §2 п.3). pkce переданий, коли usesPkce.
  buildAuthParams(state: string, pkce?: PkcePair): Record<string, string>;
  parseTokenResponse(json: unknown): ParsedTokenResponse;
  fetchAccountIdentity(accessToken: string): Promise<AccountIdentity>;
}
