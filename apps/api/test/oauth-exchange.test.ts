// Unit — OAuth token-exchange (§publishing, master-plan §2 п.2). Ламається мовчки: X/Twitter шле
// креди HTTP Basic'ом, LinkedIn/IG — параметрами тіла; переплутати = провайдер відхиляє exchange
// уже в проді. Мокаємо fetch і перевіряємо саме конструкцію заголовка/тіла + проброс PKCE-verifier.
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildAuthorizeUrl, exchangeCode, refreshAccessToken } from "../src/lib/oauth/exchange";
import type { OAuthProviderConfig } from "../src/lib/oauth/types";

function baseCfg(overrides: Partial<OAuthProviderConfig> = {}): OAuthProviderConfig {
  return {
    authorizeUrl: "https://provider.example/oauth/authorize",
    tokenUrl: "https://provider.example/oauth/token",
    scopes: ["read", "write"],
    clientId: "client-123",
    clientSecret: "secret-xyz",
    redirectUri: "https://saas.example/api/connections/x/callback",
    buildAuthParams: (state, pkce) => ({
      response_type: "code",
      client_id: "client-123",
      redirect_uri: "https://saas.example/api/connections/x/callback",
      state,
      scope: "read write",
      ...(pkce ? { code_challenge: pkce.challenge, code_challenge_method: "S256" } : {}),
    }),
    parseTokenResponse: (json) => {
      const j = json as { access_token: string; refresh_token?: string; expires_in?: number };
      return { accessToken: j.access_token, refreshToken: j.refresh_token, expiresIn: j.expires_in };
    },
    fetchAccountIdentity: async () => ({ id: "u1", name: "Test" }),
    ...overrides,
  };
}

// Мок fetch, що фіксує аргументи й повертає валідний token-JSON.
function mockFetch() {
  const fn = vi.fn(async () =>
    new Response(JSON.stringify({ access_token: "AT", refresh_token: "RT", expires_in: 3600 }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
  );
  vi.stubGlobal("fetch", fn);
  return fn;
}

function lastCall(fn: ReturnType<typeof mockFetch>) {
  const [url, init] = fn.mock.calls.at(-1)!;
  const headers = (init!.headers ?? {}) as Record<string, string>;
  const body = new URLSearchParams((init!.body as string) ?? "");
  return { url, headers, body };
}

afterEach(() => vi.unstubAllGlobals());

describe("exchangeCode — tokenAuth", () => {
  it('"params": креди в тілі форми, БЕЗ Authorization', async () => {
    const fn = mockFetch();
    const cfg = baseCfg({ tokenAuth: "params" });
    const res = await exchangeCode(cfg, "the-code");

    const { headers, body } = lastCall(fn);
    expect(headers.authorization).toBeUndefined();
    expect(body.get("client_id")).toBe("client-123");
    expect(body.get("client_secret")).toBe("secret-xyz");
    expect(body.get("grant_type")).toBe("authorization_code");
    expect(body.get("code")).toBe("the-code");
    expect(body.get("redirect_uri")).toBe(cfg.redirectUri);
    // parseTokenResponse нормалізує сиру відповідь провайдера.
    expect(res).toEqual({ accessToken: "AT", refreshToken: "RT", expiresIn: 3600 });
  });

  it('"basic": Authorization: Basic base64(id:secret), креди НЕ в тілі', async () => {
    const fn = mockFetch();
    const cfg = baseCfg({ tokenAuth: "basic" });
    await exchangeCode(cfg, "the-code");

    const { headers, body } = lastCall(fn);
    const expected = "Basic " + Buffer.from("client-123:secret-xyz").toString("base64");
    expect(headers.authorization).toBe(expected);
    expect(body.get("client_id")).toBeNull();
    expect(body.get("client_secret")).toBeNull();
  });

  it("PKCE: code_verifier у тілі, коли переданий", async () => {
    const fn = mockFetch();
    await exchangeCode(baseCfg({ usesPkce: true }), "the-code", "verifier-abc");
    expect(lastCall(fn).body.get("code_verifier")).toBe("verifier-abc");
  });

  it("без PKCE: code_verifier відсутній", async () => {
    const fn = mockFetch();
    await exchangeCode(baseCfg(), "the-code");
    expect(lastCall(fn).body.get("code_verifier")).toBeNull();
  });

  it("не-2xx token-ендпоінт → кидає (не тихо повертає сміття)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("invalid_grant", { status: 400 })),
    );
    await expect(exchangeCode(baseCfg(), "bad")).rejects.toThrow(/400/);
  });
});

describe("refreshAccessToken", () => {
  it("шле grant_type=refresh_token + refresh_token", async () => {
    const fn = mockFetch();
    await refreshAccessToken(baseCfg({ tokenAuth: "params" }), "RT-1");
    const { body } = lastCall(fn);
    expect(body.get("grant_type")).toBe("refresh_token");
    expect(body.get("refresh_token")).toBe("RT-1");
  });
});

describe("buildAuthorizeUrl", () => {
  it("делегує scope-рядок у buildAuthParams (НЕ хардкодить space-join)", () => {
    const url = new URL(buildAuthorizeUrl(baseCfg({ usesPkce: true }), "st-1", { verifier: "v", challenge: "ch" }));
    expect(url.origin + url.pathname).toBe("https://provider.example/oauth/authorize");
    expect(url.searchParams.get("state")).toBe("st-1");
    expect(url.searchParams.get("scope")).toBe("read write");
    expect(url.searchParams.get("code_challenge")).toBe("ch");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
  });
});
