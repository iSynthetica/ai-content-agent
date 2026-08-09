// Unit — instagram OAuthProviderConfig (§publishing/03-instagram §3). Фреймворк-шлях уже покритий
// oauth-exchange тестами; тут — лише IG-специфіка: comma-join scope, no-PKCE/params, і головне —
// fetchAccountIdentity, що розмінює токен, знаходить IG Business акаунт і повертає PAGE-токен як override.
import { afterEach, describe, expect, it, vi } from "vitest";
import { instagramOAuthConfig } from "../src/lib/oauth/providers/instagram";
import type { AppConfig } from "../src/config/env";

const env = {
  IG_CLIENT_ID: "ig-client",
  IG_CLIENT_SECRET: "ig-secret",
  IG_REDIRECT_URI: "https://saas.forteqsolution.com/api/connections/instagram/callback",
  IG_GRAPH_VERSION: "v21.0",
} as unknown as AppConfig;

function fakeResponse(json: unknown, ok = true, status = 200): Response {
  return { ok, status, json: async () => json, text: async () => JSON.stringify(json) } as unknown as Response;
}

afterEach(() => vi.unstubAllGlobals());

describe("instagramOAuthConfig", () => {
  it("sets FB endpoints, no PKCE, params auth", () => {
    const cfg = instagramOAuthConfig(env);
    expect(cfg.usesPkce).toBe(false);
    expect(cfg.tokenAuth).toBe("params");
    expect(cfg.authorizeUrl).toBe("https://www.facebook.com/v21.0/dialog/oauth");
    expect(cfg.tokenUrl).toBe("https://graph.facebook.com/v21.0/oauth/access_token");
  });

  it("comma-joins scope in authorize params (FB, not space)", () => {
    const cfg = instagramOAuthConfig(env);
    const params = cfg.buildAuthParams("st-1");
    expect(params.scope).toContain(",");
    expect(params.scope).not.toContain(" ");
    expect(params.scope).toContain("instagram_content_publish");
    expect(params.redirect_uri).toBe(env.IG_REDIRECT_URI);
    expect(params.state).toBe("st-1");
  });

  it("fetchAccountIdentity discovers ig-user-id + returns PAGE token as override", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("fb_exchange_token")) return fakeResponse({ access_token: "LONG_USER_TOKEN" });
        if (url.includes("/me/accounts")) {
          return fakeResponse({
            data: [
              { id: "pg-1", name: "Acme Page", access_token: "PAGE_TOKEN", instagram_business_account: { id: "ig-999", username: "acme" } },
            ],
          });
        }
        return fakeResponse({}, false, 400);
      }),
    );
    const cfg = instagramOAuthConfig(env);
    const identity = await cfg.fetchAccountIdentity("SHORT_USER_TOKEN");
    expect(identity.id).toBe("ig-999");
    expect(identity.tokenOverride).toBe("PAGE_TOKEN");
    expect((identity.meta as { igUserId?: string }).igUserId).toBe("ig-999");
    expect(identity.name).toContain("acme");
  });

  it("throws when no linked IG Business account is found", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("fb_exchange_token")) return fakeResponse({ access_token: "LONG_USER_TOKEN" });
        if (url.includes("/me/accounts")) return fakeResponse({ data: [{ id: "pg-1", name: "No IG", access_token: "T" }] });
        return fakeResponse({}, false, 400);
      }),
    );
    const cfg = instagramOAuthConfig(env);
    await expect(cfg.fetchAccountIdentity("SHORT")).rejects.toThrow(/Instagram Business/);
  });
});
