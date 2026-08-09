// Unit — twitter OAuthProviderConfig (§publishing/02-twitter §2). Фреймворк-шлях (exchange/pkce) уже
// покритий oauth-exchange/oauth-pkce тестами; тут перевіряємо лише X-специфіку конфіга: PKCE+basic
// прапорці, space-join scope, проброс code_challenge у authorize-параметри, нормалізацію токен-відповіді.
import { describe, expect, it } from "vitest";
import { twitterOAuthConfig } from "../src/lib/oauth/providers/twitter";
import type { AppConfig } from "../src/config/env";

const env = {
  X_CLIENT_ID: "x-client",
  X_CLIENT_SECRET: "x-secret",
  X_REDIRECT_URI: "https://saas.forteqsolution.com/api/connections/twitter/callback",
} as unknown as AppConfig;

describe("twitterOAuthConfig", () => {
  it("sets PKCE + basic auth and the v2 endpoints", () => {
    const cfg = twitterOAuthConfig(env);
    expect(cfg.usesPkce).toBe(true);
    expect(cfg.tokenAuth).toBe("basic");
    expect(cfg.authorizeUrl).toBe("https://twitter.com/i/oauth2/authorize");
    expect(cfg.tokenUrl).toBe("https://api.twitter.com/2/oauth2/token");
    expect(cfg.scopes).toEqual([
      "tweet.read",
      "tweet.write",
      "users.read",
      "offline.access",
      "media.write",
    ]);
  });

  it("space-joins scope and injects the PKCE challenge + per-request clientId into authorize params", () => {
    const cfg = twitterOAuthConfig(env);
    // clientId тепер приходить per-request (BYO-app), а не з env-конфіга.
    const params = cfg.buildAuthParams("x-client", "st-1", { verifier: "v", challenge: "ch" });
    expect(params.response_type).toBe("code");
    expect(params.client_id).toBe("x-client");
    expect(params.redirect_uri).toBe(env.X_REDIRECT_URI);
    expect(params.state).toBe("st-1");
    expect(params.scope).toBe("tweet.read tweet.write users.read offline.access media.write");
    expect(params.code_challenge).toBe("ch");
    expect(params.code_challenge_method).toBe("S256");
  });

  it("normalizes the token response (access + refresh + expires_in + scope)", () => {
    const cfg = twitterOAuthConfig(env);
    expect(
      cfg.parseTokenResponse({
        access_token: "AT",
        refresh_token: "RT",
        expires_in: 7200,
        scope: "tweet.read tweet.write",
      }),
    ).toEqual({ accessToken: "AT", refreshToken: "RT", expiresIn: 7200, scope: "tweet.read tweet.write" });
  });
});
