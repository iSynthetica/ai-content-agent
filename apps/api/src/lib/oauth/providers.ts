// Реєстр OAuth-провайдерів (§publishing foundation §3.1, §byo-oauth-app-creds). ЗАВЖДИ реєструє всі
// три соц-провайдери: конфіг тепер — чиста статична метадана (authorize/token URLs, scopes, tokenAuth,
// PKCE), БЕЗ кред. Креди (client id + secret) належать орендарю (BYO-app) і резолвляться per-request
// у ConnectionsService.resolveCreds (креди з БД → env-fallback). Тому «configured» більше НЕ залежить
// від наявності env-запису тут — це per-tenant перевірка в сервісі (env-gate прибрано).
import type { PublishProvider } from "@forteq/shared";
import type { AppConfig } from "../../config/env";
import type { OAuthProviderConfig } from "./types";
import { linkedinOAuthConfig } from "./providers/linkedin";
import { twitterOAuthConfig } from "./providers/twitter";
import { instagramOAuthConfig } from "./providers/instagram";

export function oauthProviders(
  env: AppConfig,
): Partial<Record<PublishProvider, OAuthProviderConfig>> {
  // Усі три — завжди. env потрібен лише для статики (redirectUri, IG_GRAPH_VERSION), не для кред.
  return {
    linkedin: linkedinOAuthConfig(env),
    twitter: twitterOAuthConfig(env),
    instagram: instagramOAuthConfig(env),
  };
}
