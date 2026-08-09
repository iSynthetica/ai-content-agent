// LinkedIn-публікатор (§publishing/01-linkedin §5) — реалізує порт Publisher (types.ts). MVP —
// MEMBER-постинг через Posts API (POST /rest/posts, не деприкейтнутий /v2/ugcPosts). Текст —
// у форматі `little` (plain text із зарезервованим набором символів, який ТРЕБА екранувати).
// Зображення (опційно) — 3-кроковий Images API. ID поста — у ХЕДЕРІ x-restli-id, не в тілі.
import type { Publisher, PublishInput, PublishResult } from "./types.js";

const API = "https://api.linkedin.com/rest";

// Заголовки кожного /rest/*-виклику. LinkedIn-Version (YYYYMM) + X-Restli-Protocol-Version: 2.0.0 —
// обовʼязкові: пропущений version-хедер = заплутаний 400/426 (§9). На DMS-хості (upload) їх НЕ шлемо.
const liHeaders = (token: string, version: string): Record<string, string> => ({
  Authorization: `Bearer ${token}`,
  "LinkedIn-Version": version,
  "X-Restli-Protocol-Version": "2.0.0",
  "Content-Type": "application/json",
});

// Зарезервовані символи `little`-формату (§3.4). Порядок ВАЖЛИВИЙ: '\' екрануємо ПЕРШИМ, інакше
// подвійне екранування. Всі мають бути екрановані навіть якщо не є частиною підтримуваного елемента
// (пряма вимога доків little Text Format).
const LITTLE_RESERVED = ["\\", "|", "{", "}", "@", "[", "]", "(", ")", "<", ">", "#", "*", "_", "~"];

// Плоский markdown → little. LinkedIn — plain text (без bold/italic/heading/anchor-links): спершу
// прибираємо markdown-синтаксис, далі blanket-екрануємо зарезервований набір. Blanket-екранування
// коректне, бо MVP не емітить mentions/hashtag-темплейтів (§3.4).
export function flattenMarkdownToLittle(md: string): string {
  let t = md ?? "";
  // 1) прибрати markdown-синтаксис.
  t = t.replace(/^#{1,6}\s+/gm, ""); // заголовки → текст (інакше '#' став би хештегом/екранувався)
  t = t.replace(/\*\*(.+?)\*\*/g, "$1"); // bold **x**
  t = t.replace(/__(.+?)__/g, "$1"); // bold __x__
  t = t.replace(/(?<!\*)\*(?!\*)(.+?)\*/g, "$1"); // italic *x*
  t = t.replace(/(?<!_)_(?!_)(.+?)_(?!_)/g, "$1"); // italic _x_
  t = t.replace(/`{1,3}([^`]*)`{1,3}/g, "$1"); // code fences / inline `x`
  t = t.replace(/^\s*>\s?/gm, ""); // цитати `> `
  t = t.replace(/^\s*[-*]\s+/gm, "• "); // марковані списки → • (уникаємо екранування '*')
  t = t.replace(/^\s*\d+\.\s+/gm, "• "); // нумеровані списки → •
  t = t.replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 $2"); // [label](url) → "label url"
  // 2) екранувати зарезервовані символи (спершу backslash!).
  for (const ch of LITTLE_RESERVED) {
    t = t.split(ch).join("\\" + ch);
  }
  return t.trim();
}

// Ліміт commentary — 3000 символів (§3.5). Політика D2: TRUNCATE + warn (не hard-fail): усічений
// пост кращий за жодний, а генератор і так цілить у довжину LinkedIn. Ріжемо по межі слова.
const MAX = 3000;
export function clampCommentary(s: string): string {
  if (s.length <= MAX) return s;
  const cut = s.slice(0, MAX - 1);
  const at = cut.lastIndexOf(" ");
  return (at > MAX * 0.6 ? cut.slice(0, at) : cut) + "…";
}

export function makeLinkedInPublisher(version: string): Publisher {
  return {
    async publish(input: PublishInput): Promise<PublishResult> {
      const { item, imageBytes, connection } = input;
      const token = connection.accessToken;

      // author: member-URN (MVP) АБО org-URN (meta.organizationUrn) — ЄДИНА гілка identity тут.
      const meta = connection.meta as
        | { authorType?: string; organizationUrn?: string }
        | undefined;
      const author =
        (meta?.authorType === "organization" && meta?.organizationUrn) ||
        connection.externalAccountId;
      if (!author) throw new Error("LinkedIn: відсутній author URN у connection");

      const title = item.title?.trim();
      const body = item.text?.trim() ?? "";
      if (!title && !body) throw new Error("LinkedIn: порожній контент (немає title/text)");
      // LinkedIn не має title-поля — title стає першим рядком commentary (§3.3).
      const raw = title ? `${title}\n\n${body}` : body;
      const commentary = clampCommentary(flattenMarkdownToLittle(raw));

      // media (опційно): initializeUpload → PUT bytes → отримуємо image URN. owner ДОРІВНЮЄ author.
      let mediaUrn: string | undefined;
      if (item.imageUrl && imageBytes) {
        const init = await fetch(`${API}/images?action=initializeUpload`, {
          method: "POST",
          headers: liHeaders(token, version),
          body: JSON.stringify({ initializeUploadRequest: { owner: author } }),
        });
        if (!init.ok) throw await liError("images.initializeUpload", init);
        const { value } = (await init.json()) as { value: { uploadUrl: string; image: string } };
        const put = await fetch(value.uploadUrl, {
          method: "PUT",
          headers: { Authorization: `Bearer ${token}` }, // на DMS-хості ЛИШЕ bearer (без version/restli/json)
          body: imageBytes,
        });
        if (!put.ok) throw await liError("images.upload", put);
        mediaUrn = value.image; // urn:li:image:...
      }

      const payload: Record<string, unknown> = {
        author,
        commentary,
        visibility: "PUBLIC",
        distribution: {
          feedDistribution: "MAIN_FEED",
          targetEntities: [],
          thirdPartyDistributionChannels: [],
        },
        lifecycleState: "PUBLISHED",
        isReshareDisabledByAuthor: false,
      };
      if (mediaUrn) payload.content = { media: { altText: title ?? "Image", id: mediaUrn } };

      const res = await fetch(`${API}/posts`, {
        method: "POST",
        headers: liHeaders(token, version),
        body: JSON.stringify(payload),
      });
      if (res.status !== 201) throw await liError("posts.create", res);

      // ID поста — у ХЕДЕРІ x-restli-id (напр. urn:li:share:...), НЕ в тілі відповіді.
      const urn = res.headers.get("x-restli-id");
      if (!urn) throw new Error("LinkedIn: 201 без x-restli-id");
      return {
        externalPostId: urn,
        externalUrl: `https://www.linkedin.com/feed/update/${urn}/`,
      };
    },
  };
}

// Типізована помилка з класифікацією retry/fail для хендлера (§4.2): 429/409/5xx — retryable,
// решта (400/401/403/422) — ні. Хендлер (foundation §4.2) вирішує retry vs. fail-and-inbox.
export interface LinkedInError extends Error {
  retryable: boolean;
  status: number;
}

async function liError(where: string, res: Response): Promise<LinkedInError> {
  const text = await res.text().catch(() => "");
  const e = new Error(`LinkedIn ${where} ${res.status}: ${text}`) as LinkedInError;
  e.retryable = res.status === 429 || res.status === 409 || res.status >= 500;
  e.status = res.status;
  return e;
}
