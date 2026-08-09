// Короткоживучий підписаний state/PKCE-cookie (§publishing foundation §3.2). Тримає {state,
// verifier?, provider, exp} між authorize і callback. Навіщо cookie, а не рядок у БД: state живе
// секунди й прив'язаний до браузера користувача — httpOnly-cookie дешевший за таблицю та сам
// зникає. HMAC (MEDIA_SIGNING_SECRET або окремий OAUTH_STATE_SECRET) робить його непідробним.
//
// accountId/userId у cookie НЕ кладемо: вони беруться з автентифікованої сесії в обох хендлерах
// (authorize і callback під requireAuth). Cookie відповідає лише за CSRF (звірка state) і PKCE.
import { createHmac, timingSafeEqual } from "node:crypto";

export const OAUTH_STATE_COOKIE = "forteq_oauth_state";
export const OAUTH_STATE_TTL_SEC = 600; // 10 хв — з запасом на consent-екран провайдера

export interface OAuthStatePayload {
  state: string; // CSRF-токен, звіряється з query ?state на callback
  provider: string; // проти якого провайдера відкрито flow (захист від крос-провайдерного reuse)
  verifier?: string; // PKCE code_verifier (лише коли usesPkce)
  exp: number; // unix-секунди протухання (single-use + TTL)
}

// Підпис: base64url(json) "." base64url(hmacSha256). Дзеркалить media-token.ts.
export function signState(payload: OAuthStatePayload, secret: string): string {
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const sig = createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${sig}`;
}

// Перевіряє підпис + строк. Підроблений/побитий/прострочений → null (ніколи не кидає).
export function verifyState(value: string, secret: string): OAuthStatePayload | null {
  const dot = value.indexOf(".");
  if (dot <= 0 || dot === value.length - 1) return null;
  const body = value.slice(0, dot);
  const sigB64 = value.slice(dot + 1);

  const expected = createHmac("sha256", secret).update(body).digest();
  let provided: Buffer;
  try {
    provided = Buffer.from(sigB64, "base64url");
  } catch {
    return null;
  }
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) return null;

  let payload: OAuthStatePayload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as OAuthStatePayload;
  } catch {
    return null;
  }
  if (
    !payload ||
    typeof payload.state !== "string" ||
    typeof payload.provider !== "string" ||
    typeof payload.exp !== "number"
  ) {
    return null;
  }
  if (payload.exp * 1000 < Date.now()) return null; // прострочено

  return payload;
}

// Set-Cookie для authorize. SameSite=Lax ОБОВ'ЯЗКОВИЙ: провайдер редіректить браузер назад top-level
// GET-навігацією з чужого сайту — Strict такий cookie відкинув би, а Lax дозволяє. Secure у prod.
export function buildStateSetCookie(value: string, opts: { secure: boolean }): string {
  const parts = [
    `${OAUTH_STATE_COOKIE}=${value}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${OAUTH_STATE_TTL_SEC}`,
  ];
  if (opts.secure) parts.push("Secure");
  return parts.join("; ");
}

// Set-Cookie для очищення на callback (single-use: одразу гасимо, щоб токен не переграли).
export function clearStateSetCookie(opts: { secure: boolean }): string {
  const parts = [`${OAUTH_STATE_COOKIE}=`, "Path=/", "HttpOnly", "SameSite=Lax", "Max-Age=0"];
  if (opts.secure) parts.push("Secure");
  return parts.join("; ");
}

// Витягує й валідує payload з заголовка Cookie (без cookie-parser — парсимо вручну, як робить
// resolveSession для сесії).
export function readStateCookie(
  cookieHeader: string | undefined,
  secret: string,
): OAuthStatePayload | null {
  if (!cookieHeader) return null;
  const raw = cookieHeader
    .split(";")
    .map((s) => s.trim())
    .find((s) => s.startsWith(`${OAUTH_STATE_COOKIE}=`));
  if (!raw) return null;
  const value = raw.slice(OAUTH_STATE_COOKIE.length + 1);
  if (!value) return null;
  return verifyState(value, secret);
}
