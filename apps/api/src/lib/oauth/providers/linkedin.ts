// LinkedIn OAuthProviderConfig (§publishing/01-linkedin §2.6). Заповнює контракт OAuthProviderConfig
// (lib/oauth/types.ts) для провайдера `linkedin` — фреймворк-шлях (exchange.ts/state-cookie.ts) його
// не чіпає, він лише параметричний. MVP — MEMBER-постинг (scope w_member_social), author-URN береться
// з OpenID userinfo. Org-режим (§2.5) — окрема гілка у fetchAccountIdentity, тут свідомо не вмикаємо.
import type { AppConfig } from "../../../config/env";
import type { OAuthProviderConfig } from "../types";

// MVP member-scopes (§2.2). openid+profile+email — для userinfo/назви акаунта; w_member_social —
// власне право постити від імені члена. Org-режим пізніше додасть w_organization_social.
const LINKEDIN_SCOPES = ["openid", "profile", "email", "w_member_social"];

export function linkedinOAuthConfig(env: AppConfig): OAuthProviderConfig {
  // redirectUri читається з env (§7), а не хардкодиться — має ТОЧНО збігатися із зареєстрованим у
  // LinkedIn-застосунку redirect (§2.1). Дефолт — прод-URL saas.forteqsolution.com/api/...callback.
  const redirectUri = env.LINKEDIN_REDIRECT_URI;

  return {
    authorizeUrl: "https://www.linkedin.com/oauth/v2/authorization",
    tokenUrl: "https://www.linkedin.com/oauth/v2/accessToken",
    scopes: LINKEDIN_SCOPES,
    clientId: env.LINKEDIN_CLIENT_ID!,
    clientSecret: env.LINKEDIN_CLIENT_SECRET!,
    redirectUri,
    // LinkedIn — vanilla 3-legged OAuth: без PKCE; client_id/secret ідуть у тілі форми (params).
    usesPkce: false,
    tokenAuth: "params",

    // state ставить фреймворк; тут лише стандартні OAuth-параметри LinkedIn. scope-роздільник (пробіл)
    // теж тут — фреймворк не join'ить сам (master-plan §2 п.3).
    buildAuthParams(state: string) {
      return {
        response_type: "code",
        client_id: env.LINKEDIN_CLIENT_ID!,
        redirect_uri: redirectUri,
        state,
        scope: LINKEDIN_SCOPES.join(" "),
      };
    },

    // LinkedIn інколи НЕ повертає refresh_token (лише для approved-партнерів «Programmatic Refresh
    // Tokens») — тому він optional. access_token живе ~60 днів (expires_in ≈ 5184000).
    parseTokenResponse(json: unknown) {
      const j = json as {
        access_token: string;
        refresh_token?: string;
        expires_in?: number;
        scope?: string;
      };
      return {
        accessToken: j.access_token,
        refreshToken: j.refresh_token,
        expiresIn: j.expires_in,
        scope: j.scope,
      };
    },

    // MVP: member-URN через OpenID userinfo (§2.5). id → service_connections.external_account_id,
    // name → external_account_name, meta.authorType="member" → service_connections.meta. Org-режим
    // (organizationAcls → urn:li:organization:{id}) — ЄДИНА гілка identity, її тут не вмикаємо.
    async fetchAccountIdentity(accessToken: string) {
      const r = await fetch("https://api.linkedin.com/v2/userinfo", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!r.ok) {
        const body = await r.text().catch(() => "");
        throw new Error(`LinkedIn userinfo failed: ${r.status} ${body}`);
      }
      const u = (await r.json()) as { sub: string; name?: string; email?: string };
      return {
        id: `urn:li:person:${u.sub}`,
        name: u.name ?? u.email ?? "LinkedIn member",
        meta: { authorType: "member" },
      };
    },
  };
}
