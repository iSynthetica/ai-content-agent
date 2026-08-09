// X/Twitter-публікатор (§publishing/02-twitter §3, §6) — реалізує порт Publisher (types.ts). MVP —
// один твіт (текст ≤280) + опційно одне зображення. Якщо текст не влазить у 280 — авто-розбивка на
// РЕПЛАЙ-ЛАНЦЮГ (тред): кожна частина — свій POST /2/tweets із reply.in_reply_to_tweet_id на попередній.
// Зображення чіпляється ЛИШЕ до першого твіта. Токен уже свіжий (хендлер рефрешить через publishTokens.ts,
// X ротує refresh_token) — публікатор лише читає connection.accessToken, як LinkedIn.
import type { Publisher, PublishInput, PublishResult } from "./types.js";

// v2-хост. Той самий api.twitter.com, що й token-URL у publishTokens.ts / api twitterOAuthConfig.
const API = "https://api.twitter.com/2";

// Стандартний ліміт твіта — 280. Premium-акаунти мають до 25k («long posts»), але НЕ припускаємо
// Premium — цілимо у безпечні 280 і тредимо понад це (§1.2).
export const MAX = 280;

// Плоский markdown → plain text. X — суто plain text (без bold/italic/heading/anchor): прибираємо
// markdown-синтаксис, АЛЕ лишаємо URL (X сам робить t.co). На відміну від LinkedIn — БЕЗ екранування
// зарезервованих символів (у X їх нема).
export function flattenMarkdownToText(md: string): string {
  let t = md ?? "";
  t = t.replace(/^#{1,6}\s+/gm, ""); // заголовки → текст
  t = t.replace(/\*\*(.+?)\*\*/g, "$1"); // bold **x**
  t = t.replace(/__(.+?)__/g, "$1"); // bold __x__
  t = t.replace(/(?<!\*)\*(?!\*)(.+?)\*/g, "$1"); // italic *x*
  t = t.replace(/(?<!_)_(?!_)(.+?)_(?!_)/g, "$1"); // italic _x_
  t = t.replace(/`{1,3}([^`]*)`{1,3}/g, "$1"); // code fences / inline `x`
  t = t.replace(/^\s*>\s?/gm, ""); // цитати `> `
  t = t.replace(/^\s*[-*]\s+/gm, "• "); // марковані списки → •
  t = t.replace(/^\s*\d+\.\s+/gm, "• "); // нумеровані списки → •
  t = t.replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 $2"); // [label](url) → "label url" (URL збережено)
  return t.trim();
}

// Розбивка тексту на частини ≤max для треду. Ріжемо по МЕЖІ СЛОВА (пробіли), тому URL (без пробілів
// усередині) ніколи не рветься навпіл (§3.4 «Never split mid-URL»). Слово, довше за ліміт (гігантський
// URL) — жорстко ріжемо на шматки max, щоб не зациклитись. Влазить у ліміт → [текст] без розбивки.
export function splitForTwitter(text: string, max: number = MAX): string[] {
  const clean = text.trim();
  if (clean.length <= max) return clean ? [clean] : [];

  const words = clean.split(/\s+/);
  const parts: string[] = [];
  let cur = "";
  for (const word of words) {
    if (word.length > max) {
      // слово саме по собі довше за ліміт — злити поточний буфер і жорстко порізати слово.
      if (cur) {
        parts.push(cur);
        cur = "";
      }
      for (let i = 0; i < word.length; i += max) parts.push(word.slice(i, i + max));
      continue;
    }
    const candidate = cur ? `${cur} ${word}` : word;
    if (candidate.length > max) {
      parts.push(cur);
      cur = word;
    } else {
      cur = candidate;
    }
  }
  if (cur) parts.push(cur);
  return parts;
}

export function makeTwitterPublisher(): Publisher {
  return {
    async publish(input: PublishInput): Promise<PublishResult> {
      const { item, imageBytes, connection } = input;
      const token = connection.accessToken;

      const text = flattenMarkdownToText(item.text ?? "");
      if (!text) throw new Error("Twitter: порожній текст — публікувати нічого");

      const auth = { Authorization: `Bearer ${token}` };

      // 1) медіа (опційно) — v2 chunked INIT→APPEND→FINALIZE; чіпляємо лише до ПЕРШОГО твіта (§3.2).
      let mediaId: string | undefined;
      if (item.imageUrl && imageBytes) {
        mediaId = await uploadImage(imageBytes, token);
      }

      // 2) розбивка на тред, якщо не влазить у 280.
      const parts = splitForTwitter(text, MAX);

      // 3) послідовна публікація з реплай-ланцюгом. Повертаємо id/URL ПЕРШОГО твіта — канонічне
      //    посилання на тред (§3.4). Ризик частково-впалого треду (твіт 1 ок, твіт 2 впав) —
      //    відомий, задокументований у §5.3; тут просто кидаємо помилку на невдалому кроці.
      let firstId: string | undefined;
      let prevId: string | undefined;
      for (let i = 0; i < parts.length; i++) {
        const body: Record<string, unknown> = { text: parts[i] };
        if (i === 0 && mediaId) body.media = { media_ids: [mediaId] };
        if (prevId) body.reply = { in_reply_to_tweet_id: prevId };

        const res = await fetch(`${API}/tweets`, {
          method: "POST",
          headers: { ...auth, "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) throw await twError("tweets.create", res);

        const json = (await res.json()) as { data?: { id?: string } };
        const id = json.data?.id;
        if (!id) throw new Error("Twitter: відповідь /2/tweets без data.id");
        prevId = id;
        if (i === 0) firstId = id;
      }

      if (!firstId) throw new Error("Twitter: жодного твіта не опубліковано");
      return {
        externalPostId: firstId,
        externalUrl: `https://twitter.com/i/web/status/${firstId}`,
      };
    },
  };
}

// v2 chunked media upload (§3.3). Одне мале зображення ⇒ один APPEND-чанк (≤5МБ), STATUS-полінг не
// потрібен (він лише для відео/GIF). Три кроки на api.x.com-аналозі api.twitter.com/2/media/upload:
// INIT (multipart, command=INIT) → APPEND (multipart, segment_index + media байти) → FINALIZE.
// Повертає media_id_string (завжди РЯДОК — JS втрачає точність на 64-біт int, §3.2).
async function uploadImage(bytes: Buffer, token: string): Promise<string> {
  const auth = { Authorization: `Bearer ${token}` };

  // INIT
  const initForm = new FormData();
  initForm.set("command", "INIT");
  initForm.set("total_bytes", String(bytes.length));
  initForm.set("media_type", "image/png"); // зображення пайплайна — gpt-image-1 PNG (§3.3)
  initForm.set("media_category", "tweet_image");
  const init = await fetch(`${API}/media/upload`, { method: "POST", headers: auth, body: initForm });
  if (!init.ok) throw await twError("media.init", init);
  const initJson = (await init.json()) as {
    data?: { id?: string; media_key?: string };
    media_id_string?: string;
  };
  const mediaId = initJson.data?.id ?? initJson.media_id_string;
  if (!mediaId) throw new Error("Twitter: media INIT без id");

  // APPEND (один чанк)
  const appendForm = new FormData();
  appendForm.set("segment_index", "0");
  appendForm.set("media", new Blob([new Uint8Array(bytes)]));
  const append = await fetch(`${API}/media/upload/${mediaId}/append`, {
    method: "POST",
    headers: auth,
    body: appendForm,
  });
  if (!append.ok) throw await twError("media.append", append);

  // FINALIZE
  const finalize = await fetch(`${API}/media/upload/${mediaId}/finalize`, {
    method: "POST",
    headers: auth,
  });
  if (!finalize.ok) throw await twError("media.finalize", finalize);

  return mediaId;
}

// Типізована помилка з класифікацією retry/fail для хендлера (§5.2): 429 (rate/cap) і 5xx — retryable;
// решта (400/401/403/422) — ні. 401 хендлер уже мав відпрацювати рефрешем ДО публікації (publishTokens);
// якщо все одно 401 — токен мертвий, не retry. Хендлер (foundation §4.2) вирішує retry vs. fail-and-inbox.
export interface TwitterError extends Error {
  retryable: boolean;
  status: number;
}

async function twError(where: string, res: Response): Promise<TwitterError> {
  const text = await res.text().catch(() => "");
  const e = new Error(`Twitter ${where} ${res.status}: ${text.slice(0, 300)}`) as TwitterError;
  e.retryable = res.status === 429 || res.status >= 500;
  e.status = res.status;
  return e;
}
