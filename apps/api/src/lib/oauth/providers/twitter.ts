// X/Twitter OAuthProviderConfig (§publishing/02-twitter §2). Заповнює контракт OAuthProviderConfig
// (lib/oauth/types.ts) для провайдера `twitter` — фреймворк-шлях (exchange.ts/pkce.ts) його НЕ чіпає,
// він лише параметричний. Єдина відмінність від LinkedIn: X ВИМАГАЄ PKCE (usesPkce:true) і HTTP Basic
// на token-ендпоінті (tokenAuth:"basic"). Обидва прапорці вже підтримані фреймворком (exchange.ts).
import type { AppConfig } from "../../../config/env";
import type { OAuthProviderConfig } from "../types";

// MVP-scopes (§2.1). tweet.write — власне право постити; tweet.read+users.read — компаньйони/users/me;
// offline.access — ОБОВʼЯЗКОВИЙ для refresh_token (без нього access-токен помирає за ~2год і зʼєднання
// стає непридатним для запланованої/асинхронної публікації). media.write — потрібен для v2 media-upload
// (наш publisher чіпляє зображення до твіта; без нього upload віддає 403, §2.1/§10).
const TWITTER_SCOPES = ["tweet.read", "tweet.write", "users.read", "offline.access", "media.write"];

export function twitterOAuthConfig(env: AppConfig): OAuthProviderConfig {
  // redirectUri читається з env (§8), а не хардкодиться — має ТОЧНО збігатися із зареєстрованим у
  // X-застосунку redirect (§2.1). Дефолт — прод-URL saas.forteqsolution.com/api/...callback.
  const redirectUri = env.X_REDIRECT_URI;

  return {
    // authorize — на twitter.com (хост-аліас x.com теж валідний); token/API — на api.twitter.com,
    // той самий token-URL, що й у воркерному publishTokens.ts (щоб exchange і refresh не розійшлися).
    authorizeUrl: "https://twitter.com/i/oauth2/authorize",
    tokenUrl: "https://api.twitter.com/2/oauth2/token",
    scopes: TWITTER_SCOPES,
    clientId: env.X_CLIENT_ID!,
    clientSecret: env.X_CLIENT_SECRET!,
    redirectUri,
    // X — обидва прапорці, на відміну від LinkedIn: PKCE обовʼязковий навіть для confidential-клієнта;
    // креди йдуть HTTP Basic'ом (Authorization: Basic base64(id:secret)), не в тілі форми.
    usesPkce: true,
    tokenAuth: "basic",

    // state ставить фреймворк; pkce.challenge інжектиться сюди, коли usesPkce (exchange.buildAuthorizeUrl).
    // scope-роздільник (пробіл) теж тут — фреймворк не join'ить сам (master-plan §2 п.3).
    buildAuthParams(state: string, pkce) {
      const params: Record<string, string> = {
        response_type: "code",
        client_id: env.X_CLIENT_ID!,
        redirect_uri: redirectUri,
        state,
        scope: TWITTER_SCOPES.join(" "),
      };
      // pkce присутній завжди (usesPkce:true), але лишаємо guard — контракт робить його optional.
      if (pkce) {
        params.code_challenge = pkce.challenge;
        params.code_challenge_method = "S256";
      }
      return params;
    },

    // access_token ~2год (expires_in:7200). refresh_token присутній лише бо запитали offline.access,
    // і X РОТУЄ його на кожному refresh — новий треба персистити (робить publishTokens.ts у воркері).
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

    // Identity через GET /2/users/me. id → external_account_id; name → "@"+username (людська назва);
    // username кладемо в meta для потенційної побудови URL /<username>/status/<id> (§2.7).
    async fetchAccountIdentity(accessToken: string) {
      const r = await fetch("https://api.twitter.com/2/users/me?user.fields=username,name", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!r.ok) {
        const body = await r.text().catch(() => "");
        throw new Error(`Twitter users/me failed: ${r.status} ${body}`);
      }
      const { data } = (await r.json()) as {
        data: { id: string; username: string; name?: string };
      };
      return {
        id: data.id,
        name: `@${data.username}`,
        meta: { username: data.username, displayName: data.name },
      };
    },
  };
}
