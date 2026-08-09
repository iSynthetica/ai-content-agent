// HMAC-підписані токени для ПУБЛІЧНИХ URL зображень (§publishing §2.5, master-plan §2 п.5).
//
// Навіщо: Instagram публікує зображення за URL, який тягне СЕРВЕР Meta (не браузер із сесією).
// Тобто зображення має бути доступне без cookie-сесії — але й не назавжди-публічним. Рішення:
// короткоживучий підписаний токен. Worker підписує (key + TTL), кладе у /media/public/<token>,
// а api-роут перевіряє підпис і строк ДО читання байтів. Секрет спільний (MEDIA_SIGNING_SECRET).
//
// Чисті функції, БЕЗ process.env (цей пакет імпортує і web): секрет приходить параметром.
import { createHmac, timingSafeEqual } from "node:crypto";

// Токен = base64url(payload) "." base64url(hmacSha256(payloadB64)). payload = `${key}:${expSec}`.
// key — ключ у сховищі зображень (`runId/draftId.ext`), без двокрапок, тож split за останньою ":".
function b64url(buf: Buffer): string {
  return buf.toString("base64url");
}

/** Підписує opaque-токен для ключа зображення з TTL у секундах. */
export function signMediaToken(key: string, secret: string, ttlSec: number): string {
  const exp = Math.floor(Date.now() / 1000) + Math.max(0, Math.floor(ttlSec));
  const payloadB64 = b64url(Buffer.from(`${key}:${exp}`, "utf8"));
  const sig = createHmac("sha256", secret).update(payloadB64).digest();
  return `${payloadB64}.${b64url(sig)}`;
}

/** Перевіряє підпис і строк. Прострочений/підроблений/побитий токен → null (ніколи не кидає). */
export function verifyMediaToken(token: string, secret: string): { key: string } | null {
  const dot = token.indexOf(".");
  if (dot <= 0 || dot === token.length - 1) return null;
  const payloadB64 = token.slice(0, dot);
  const sigB64 = token.slice(dot + 1);

  const expected = createHmac("sha256", secret).update(payloadB64).digest();
  let provided: Buffer;
  try {
    provided = Buffer.from(sigB64, "base64url");
  } catch {
    return null;
  }
  // Порівняння сталого часу — щоб підпис не витікав через таймінг. Різна довжина → одразу невалідно.
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) return null;

  let payload: string;
  try {
    payload = Buffer.from(payloadB64, "base64url").toString("utf8");
  } catch {
    return null;
  }
  const sep = payload.lastIndexOf(":");
  if (sep <= 0) return null;
  const key = payload.slice(0, sep);
  const exp = Number(payload.slice(sep + 1));
  if (!key || !Number.isFinite(exp)) return null;
  if (exp * 1000 < Date.now()) return null; // прострочено

  return { key };
}
