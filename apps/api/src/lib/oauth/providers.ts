// Реєстр OAuth-провайдерів (§publishing foundation §3.1). ПОРОЖНІЙ у foundation-фазі: адаптер-фази
// (linkedin/twitter/instagram) додають сюди по одному запису OAuthProviderConfig і відповідні
// env-креди (LINKEDIN_CLIENT_ID/SECRET, X_CLIENT_ID/SECRET, IG_CLIENT_ID/SECRET) у config/env.ts.
//
// Форма одного запису (шов для адаптера — ЗАПОВНЮЙ ТУТ):
//   linkedin: env.LINKEDIN_CLIENT_ID && env.LINKEDIN_CLIENT_SECRET
//     ? {
//         authorizeUrl: "https://www.linkedin.com/oauth/v2/authorization",
//         tokenUrl: "https://www.linkedin.com/oauth/v2/accessToken",
//         scopes: ["openid", "profile", "w_member_social"],
//         clientId: env.LINKEDIN_CLIENT_ID,
//         clientSecret: env.LINKEDIN_CLIENT_SECRET,
//         redirectUri: `${env.PUBLIC_MEDIA_BASE_URL}/connections/linkedin/callback`,
//         tokenAuth: "params",
//         buildAuthParams: (state) => ({
//           response_type: "code",
//           client_id: env.LINKEDIN_CLIENT_ID!,
//           redirect_uri: `${env.PUBLIC_MEDIA_BASE_URL}/connections/linkedin/callback`,
//           state,
//           scope: ["openid", "profile", "w_member_social"].join(" "), // scope-роздільник тут
//         }),
//         parseTokenResponse: (json) => ({ accessToken: (json as any).access_token, ... }),
//         fetchAccountIdentity: async (accessToken) => ({ id, name, meta }),
//       }
//     : undefined,
//
// isConfigured(env, provider) → true лише коли запис присутній (тобто креди в env є). UI вимикає
// кнопку Connect для не-сконфігурованих провайдерів.
import type { PublishProvider } from "@forteq/shared";
import type { AppConfig } from "../../config/env";
import type { OAuthProviderConfig } from "./types";
import { linkedinOAuthConfig } from "./providers/linkedin";
import { twitterOAuthConfig } from "./providers/twitter";

export function oauthProviders(
  env: AppConfig,
): Partial<Record<PublishProvider, OAuthProviderConfig>> {
  const providers: Partial<Record<PublishProvider, OAuthProviderConfig>> = {};
  // linkedin — запис присутній ЛИШЕ коли обидві креди задані; інакше провайдер «не сконфігурований»
  // (isConfigured → false, UI вимикає кнопку Connect). Секрети — тільки з env, у логи ніколи.
  if (env.LINKEDIN_CLIENT_ID && env.LINKEDIN_CLIENT_SECRET) {
    providers.linkedin = linkedinOAuthConfig(env);
  }
  // twitter — той самий шов: запис присутній ЛИШЕ коли обидві X-креди задані (usesPkce+basic виставляє
  // конфіг провайдера; фреймворк-шлях їх лише читає). Без кред — isConfigured→false, Connect вимкнено.
  if (env.X_CLIENT_ID && env.X_CLIENT_SECRET) {
    providers.twitter = twitterOAuthConfig(env);
  }
  return providers;
}

// «Сконфігурований» = у реєстрі є запис (адаптер повертає undefined без кред). Дешева перевірка для
// connectionsResponse.configured — фронт (server-компонент без доступу до env api) інакше не знав би.
export function isConfigured(env: AppConfig, provider: PublishProvider): boolean {
  return oauthProviders(env)[provider] !== undefined;
}
