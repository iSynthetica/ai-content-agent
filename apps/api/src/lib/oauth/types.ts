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

// OAuth-креди застосунку (client id + secret). BYO-app (§byo-oauth-app-creds): резолвляться
// per-request у сервісі (креди орендаря з БД → інакше платформенні env-fallback), а НЕ запікаються
// у конфіг провайдера. Так один код-path обслуговує застосунок кожного орендаря окремими кредами.
export interface OAuthCreds {
  clientId: string;
  clientSecret: string;
}

// Конфіг одного провайдера. Усе, чим соцмережі різняться, — тут; решта коду параметрична. Креди
// (clientId/clientSecret) СВІДОМО тут НЕМАЄ — вони per-request (OAuthCreds), бо застосунок належить
// орендарю (BYO-app), а не платформі. Конфіг лишається чистою статичною метаданою провайдера.
export interface OAuthProviderConfig {
  authorizeUrl: string; // consent-ендпоінт
  tokenUrl: string; // code → token
  scopes: string[]; // запитувані scope
  redirectUri: string; // зареєстрований у провайдера redirect (через web-BFF → api callback)
  usesPkce?: boolean; // X/Twitter — true
  tokenAuth?: "params" | "basic"; // LinkedIn/IG — params (creds у тілі); X — basic (Authorization)
  // Будує query authorize-URL. clientId приходить per-request (креди орендаря/env). scope-роздільник
  // — тут (LinkedIn/X пробіл, FB/IG кома): фреймворк НЕ join'ить сам (master-plan §2 п.3). pkce
  // переданий, коли usesPkce.
  buildAuthParams(clientId: string, state: string, pkce?: PkcePair): Record<string, string>;
  parseTokenResponse(json: unknown): ParsedTokenResponse;
  // creds потрібні IG (fb_exchange_token робить app-scoped обмін токена й мусить іти саме тими
  // кредами, якими зроблено code-exchange); LinkedIn/X їх ігнорують (identity — лише Bearer-токен).
  fetchAccountIdentity(creds: OAuthCreds, accessToken: string): Promise<AccountIdentity>;
}
