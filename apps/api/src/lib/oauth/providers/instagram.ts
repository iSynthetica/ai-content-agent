// Instagram OAuthProviderConfig (§publishing/03-instagram §3, «Facebook Login for Business»).
// Заповнює контракт OAuthProviderConfig (lib/oauth/types.ts) для провайдера `instagram` —
// фреймворк-шлях (exchange.ts/state-cookie.ts) його НЕ чіпає, він лише параметричний.
//
// Дві відмінності від LinkedIn/X, які і є вся IG-специфіка:
//  1) scope-роздільник — КОМА (FB), не пробіл (§3.1, master-plan §2 п.3).
//  2) fetchAccountIdentity робить ДВА зайві кроки, яких нема в LinkedIn/X:
//     a) short-lived user token → long-lived (60д) user token (fb_exchange_token);
//     b) /me/accounts → знайти FB-сторінку з підключеним IG Business акаунтом, узяти PAGE-токен
//        та ig-user-id. ПУБЛІКУЄМО саме PAGE-токеном (він довгоживучий, §3.4) — тож повертаємо
//        його через tokenOverride, і фреймворк кладе САМЕ його в access_token_ct (types.ts).
import type { AppConfig } from "../../../config/env";
import type { AccountIdentity, OAuthProviderConfig } from "../types";

// Scopes (§3.1). instagram_content_publish — власне право постити (Advanced Access через App Review,
// §5). pages_show_list/pages_read_engagement/business_management — щоб /me/accounts віддав сторінку,
// її PAGE-токен і підключений IG Business акаунт. instagram_basic — читання профілю IG.
const IG_SCOPES = [
  "instagram_basic",
  "instagram_content_publish",
  "pages_show_list",
  "pages_read_engagement",
  "business_management",
];

export function instagramOAuthConfig(env: AppConfig): OAuthProviderConfig {
  // Версія Graph API пінимо через env (Meta ротує версії ~щоквартально, §11) — один шов на bump.
  const ver = env.IG_GRAPH_VERSION;
  const graph = `https://graph.facebook.com/${ver}`;
  // redirectUri з env (§9), не хардкод — має ТОЧНО збігатися із зареєстрованим у Meta-застосунку (§10).
  const redirectUri = env.IG_REDIRECT_URI;

  return {
    // authorize — на www.facebook.com; token/Graph — на graph.facebook.com (§3.1).
    authorizeUrl: `https://www.facebook.com/${ver}/dialog/oauth`,
    tokenUrl: `${graph}/oauth/access_token`,
    scopes: IG_SCOPES,
    redirectUri,
    // FB Login — vanilla 3-legged OAuth: без PKCE; client_id/secret ідуть у query token-запиту (params).
    usesPkce: false,
    tokenAuth: "params",

    // state ставить фреймворк; clientId приходить per-request (креди орендаря/env, BYO-app). Тут лише
    // стандартні OAuth-параметри FB. scope-роздільник — КОМА (FB, не пробіл): фреймворк не join'ить
    // сам (master-plan §2 п.3).
    buildAuthParams(clientId: string, state: string) {
      return {
        response_type: "code",
        client_id: clientId,
        redirect_uri: redirectUri,
        state,
        scope: IG_SCOPES.join(","),
      };
    },

    // code→token віддає КОРОТКОживучий user-токен. Довгоживучий + PAGE-токен + ig-user-id —
    // усе в fetchAccountIdentity нижче (§3.3). refresh_token у FB немає (§3.4) — тому не парсимо.
    parseTokenResponse(json: unknown) {
      const j = json as { access_token: string; token_type?: string; expires_in?: number };
      return { accessToken: j.access_token, expiresIn: j.expires_in };
    },

    // IG-специфіка: розмінюємо на довгоживучий токен і знаходимо IG Business акаунт (§3.3). creds —
    // per-request (BYO-app): fb_exchange_token — app-scoped обмін, тож МУСИТЬ іти саме тими кредами,
    // якими зроблено code-exchange (креди орендаря або env-fallback), інакше Meta відхилить обмін.
    async fetchAccountIdentity(creds, shortUserToken: string): Promise<AccountIdentity> {
      // a) short-lived → long-lived (60д) user token. З нього деривований PAGE-токен НЕ протухає,
      //    поки застосунок авторизовано — тому для MVP жодного refresh-крона (§3.4). Якщо обмін
      //    впав — кидаємо: інакше збережений PAGE-токен був би короткоживучим і зламався б за ~1год.
      const exchUrl =
        `${graph}/oauth/access_token?` +
        new URLSearchParams({
          grant_type: "fb_exchange_token",
          client_id: creds.clientId,
          client_secret: creds.clientSecret,
          fb_exchange_token: shortUserToken,
        }).toString();
      const exchRes = await fetch(exchUrl);
      if (!exchRes.ok) {
        const body = await exchRes.text().catch(() => "");
        throw new Error(`Instagram fb_exchange_token failed: ${exchRes.status} ${body}`);
      }
      const exchJson = (await exchRes.json()) as { access_token?: string };
      const longUserToken = exchJson.access_token;
      if (!longUserToken) throw new Error("Instagram: обмін на довгоживучий токен без access_token");

      // b) знайти FB-сторінку з підключеним IG Business акаунтом і взяти її PAGE-токен + ig-user-id.
      const accUrl =
        `${graph}/me/accounts?` +
        new URLSearchParams({
          fields: "name,access_token,instagram_business_account{id,username}",
          access_token: longUserToken,
        }).toString();
      const accRes = await fetch(accUrl);
      if (!accRes.ok) {
        const body = await accRes.text().catch(() => "");
        throw new Error(`Instagram /me/accounts failed: ${accRes.status} ${body}`);
      }
      const { data } = (await accRes.json()) as {
        data?: Array<{
          id: string;
          name?: string;
          access_token?: string;
          instagram_business_account?: { id: string; username?: string };
        }>;
      };

      // MVP: один конект на провайдера на орендаря — беремо ПЕРШУ сторінку з IG Business акаунтом
      // (§3.3). Назву сторінки/IG показуємо в UI, щоб користувач бачив, що саме підключилось.
      const page = (data ?? []).find((p) => p.instagram_business_account?.id);
      if (!page?.instagram_business_account) {
        throw new Error(
          "Instagram: жодна Facebook-сторінка не має підключеного Instagram Business/Creator акаунта. " +
            "Переконайтесь, що IG-акаунт переведено у Business/Creator і залінковано з FB-сторінкою (§10).",
        );
      }
      const igUserId = page.instagram_business_account.id;
      const igUsername = page.instagram_business_account.username;
      const pageToken = page.access_token;
      if (!pageToken) {
        throw new Error("Instagram: /me/accounts не повернув Page access token (перевірте scope pages_show_list)");
      }

      return {
        id: igUserId, // → service_connections.external_account_id
        name: igUsername ? `@${igUsername} (${page.name ?? "Facebook Page"})` : page.name ?? "Instagram",
        meta: { igUserId, pageId: page.id, pageName: page.name, igUsername },
        // ПУБЛІКУЄМО PAGE-токеном, а не user-токеном (§3.4) — override зберігається як access_token_ct.
        tokenOverride: pageToken,
      };
    },
  };
}
