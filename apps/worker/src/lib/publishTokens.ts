// Мінімальний refresh access-токена у ВОРКЕРІ (§publishing foundation §4.2, крок 3).
//
// Свідомо НЕ імпортуємо з apps/api (тверда межа між застосунками) — це локальне дзеркало
// apps/api/src/lib/oauth/exchange.ts:refreshAccessToken. Тримаємо мінімальним: token-URL і стиль
// авторизації беремо зі статичної per-provider мапи, client_id/secret — з env воркера.
//
// Foundation-фаза: кред у env зазвичай ще нема → refresh повертає null, і хендлер позначає
// публікацію failed "reconnect required". Адаптер-фази додають креди того ж провайдера.
import type { Logger as PinoLogger } from "pino";
import type { Env } from "../config/env.js";
import type { PublishProvider } from "@forteq/shared";

// Розшифрований connection у пам'яті (токени НЕ потрапляють у payload/checkpointer, §ADR-0016).
export interface DecryptedConnection {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date | null;
  externalAccountId?: string;
  meta?: Record<string, unknown>;
}

export interface RefreshedToken {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date | null;
}

// Статична per-provider конфігурація token-ендпоінта. tokenAuth дзеркалить exchange.ts:
// X/Twitter — HTTP Basic на token-URL; LinkedIn — client creds у тілі форми. Instagram (Page
// token, D4) — long-lived без refresh-grant'а, тож refreshable:false (рефреш не намагаємось).
const TOKEN_ENDPOINTS: Record<
  PublishProvider,
  { url: string; tokenAuth: "basic" | "params"; refreshable: boolean }
> = {
  linkedin: {
    url: "https://www.linkedin.com/oauth/v2/accessToken",
    tokenAuth: "params",
    refreshable: true,
  },
  twitter: {
    url: "https://api.twitter.com/2/oauth2/token",
    tokenAuth: "basic",
    refreshable: true,
  },
  instagram: {
    // Facebook Page access token (D4) — довгоживучий, стандартного refresh-grant'а нема.
    url: "https://graph.facebook.com/v21.0/oauth/access_token",
    tokenAuth: "params",
    refreshable: false,
  },
};

function creds(env: Env, provider: PublishProvider): { id?: string; secret?: string } {
  if (provider === "linkedin") return { id: env.LINKEDIN_CLIENT_ID, secret: env.LINKEDIN_CLIENT_SECRET };
  if (provider === "twitter") return { id: env.X_CLIENT_ID, secret: env.X_CLIENT_SECRET };
  return { id: env.IG_CLIENT_ID, secret: env.IG_CLIENT_SECRET };
}

/** Токен протух (або протухне за 60с)? Немає expiresAt → вважаємо валідним (не рефрешимо наосліп). */
export function isExpired(expiresAt: Date | null | undefined, now: Date = new Date()): boolean {
  if (!expiresAt) return false;
  return expiresAt.getTime() - now.getTime() <= 60_000;
}

/**
 * Рефрешить access-токен, якщо він протух і є refresh_token + креди провайдера. Повертає:
 *  - оновлений токен (успіх),
 *  - null, якщо рефреш неможливий (нема refresh_token/кред/URL, провайдер non-refreshable) або HTTP впав.
 * Хендлер за null на протухлому токені позначає публікацію failed "reconnect required".
 * Помилку НЕ кидає (best-effort): падіння рефреша не має валити job.
 */
export async function refreshIfNeeded(
  provider: PublishProvider,
  conn: DecryptedConnection,
  env: Env,
  logger: PinoLogger,
): Promise<RefreshedToken | null> {
  if (!isExpired(conn.expiresAt)) {
    // Ще валідний — віддаємо як є.
    return { accessToken: conn.accessToken, refreshToken: conn.refreshToken, expiresAt: conn.expiresAt };
  }
  const cfg = TOKEN_ENDPOINTS[provider];
  if (!cfg.refreshable || !conn.refreshToken) return null; // рефреш неможливий → reconnect required

  const { id, secret } = creds(env, provider);
  if (!id || !secret) {
    logger.warn({ provider }, "publishTokens: нема OAuth-кред у env — рефреш пропущено");
    return null;
  }

  try {
    const form = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: conn.refreshToken,
    });
    const headers: Record<string, string> = {
      "content-type": "application/x-www-form-urlencoded",
      accept: "application/json",
    };
    if (cfg.tokenAuth === "basic") {
      headers.authorization = `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`;
    } else {
      form.set("client_id", id);
      form.set("client_secret", secret);
    }

    const res = await fetch(cfg.url, { method: "POST", headers, body: form.toString() });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      logger.warn({ provider, status: res.status, body: text.slice(0, 200) }, "publishTokens: refresh failed");
      return null;
    }
    const json = (await res.json()) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
    };
    if (!json.access_token) return null;
    return {
      accessToken: json.access_token,
      // Провайдер може НЕ повернути новий refresh_token — тоді лишаємо старий.
      refreshToken: json.refresh_token ?? conn.refreshToken,
      expiresAt: json.expires_in ? new Date(Date.now() + json.expires_in * 1000) : null,
    };
  } catch (e) {
    logger.warn({ provider, err: e instanceof Error ? e.message : String(e) }, "publishTokens: refresh error");
    return null;
  }
}
