// Instagram-публікатор (§publishing/03-instagram §4) — реалізує порт Publisher (types.ts). IG публікує
// у ДВА кроки через Graph API: (1) create media container з image_url+caption → (2) media_publish.
// КЛЮЧОВЕ: image_url тягне СЕРВЕР Meta (без cookie), тому хендлер карбує publicImageUrl (короткоживучий
// підписаний токен → /media/public/:token, який ще й транскодить PNG→JPEG). Зображення ОБОВʼЯЗКОВЕ.
// Публікуємо PAGE-токеном (connection.accessToken; його поклав fetchAccountIdentity через tokenOverride)
// на ig-user-id (connection.meta.igUserId). Токен довгоживучий — рефреш не потрібен (§3.4).
import type { Publisher, PublishInput, PublishResult } from "./types.js";

const GRAPH = "https://graph.facebook.com";

// Ліміт підпису IG — ~2200 символів (§4). Клампимо по межі слова, щоб не різати посеред слова/хештега.
const CAPTION_MAX = 2200;

// Скільки разів опитати статус контейнера перед публікацією (зображення зазвичай FINISHED одразу,
// але Meta обробляє асинхронно — даємо кілька спроб із паузою). ~ до 20с сумарно.
const STATUS_POLL_TRIES = 10;
const STATUS_POLL_DELAY_MS = 2000;

class InstagramError extends Error {
  retryable: boolean;
  status: number;
  constructor(message: string, status: number, retryable: boolean) {
    super(message);
    this.name = "InstagramError";
    this.status = status;
    this.retryable = retryable;
  }
}

// Плоский markdown → plain text. IG-підпис — plain text (без bold/italic/heading/anchor); лишаємо
// URL та хештеги як є. Прибираємо синтаксис markdown, зберігаємо переноси абзаців.
export function flattenCaption(title: string | null, text: string | null): string {
  const parts = [title?.trim(), text?.trim()].filter(Boolean) as string[];
  let t = parts.join("\n\n");
  t = t.replace(/^#{1,6}\s+/gm, ""); // markdown-заголовки → текст (НЕ IG-хештег)
  t = t.replace(/\*\*(.+?)\*\*/g, "$1"); // bold **x**
  t = t.replace(/__(.+?)__/g, "$1"); // bold __x__
  t = t.replace(/(?<!\*)\*(?!\*)(.+?)\*/g, "$1"); // italic *x*
  t = t.replace(/`{1,3}([^`]*)`{1,3}/g, "$1"); // code
  t = t.replace(/^\s*>\s?/gm, ""); // цитати
  t = t.replace(/^\s*[-*]\s+/gm, "• "); // марковані списки → •
  t = t.replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 $2"); // [label](url) → label url
  return t.trim();
}

export function clampCaption(s: string, max: number = CAPTION_MAX): string {
  if (s.length <= max) return s;
  const cut = s.slice(0, max - 1);
  const at = cut.lastIndexOf(" ");
  return (at > max * 0.6 ? cut.slice(0, at) : cut) + "…";
}

async function igError(where: string, res: Response): Promise<InstagramError> {
  const text = await res.text().catch(() => "");
  // 4xx (крім 429) — здебільшого невиправно (погані права/акаунт/зображення); 429/5xx — ретраябл.
  const retryable = res.status === 429 || res.status >= 500;
  return new InstagramError(`Instagram ${where} ${res.status}: ${text}`, res.status, retryable);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function makeInstagramPublisher(graphVersion: string): Publisher {
  const api = `${GRAPH}/${graphVersion}`;
  return {
    async publish(input: PublishInput): Promise<PublishResult> {
      const { item, publicImageUrl, connection } = input;
      const token = connection.accessToken;
      // ig-user-id — з meta (fetchAccountIdentity) або external_account_id (там теж лежить ig-user-id).
      const igUserId =
        (connection.meta?.igUserId as string | undefined) || connection.externalAccountId;
      if (!igUserId) throw new Error("Instagram: відсутній ig-user-id у connection");
      // IG ВИМАГАЄ зображення — і саме публічний URL (Graph тягне його сам). Без нього публікувати нічого.
      if (!publicImageUrl) {
        throw new Error("Instagram: потрібне зображення (publicImageUrl) — пост без картинки неможливий");
      }

      const caption = clampCaption(flattenCaption(item.title, item.text));

      // Крок 1: створити media-контейнер (image_url + caption). Meta асинхронно завантажить зображення.
      const createUrl =
        `${api}/${igUserId}/media?` +
        new URLSearchParams({ image_url: publicImageUrl, caption, access_token: token }).toString();
      const createRes = await fetch(createUrl, { method: "POST" });
      if (!createRes.ok) throw await igError("media(create-container)", createRes);
      const created = (await createRes.json()) as { id?: string };
      const creationId = created.id;
      if (!creationId) throw new Error("Instagram: create-container без id");

      // Крок 2: дочекатись, поки контейнер стане FINISHED (Meta тягне+валідує зображення асинхронно).
      // ERROR/EXPIRED — невиправно; IN_PROGRESS — чекаємо; FINISHED — публікуємо.
      for (let i = 0; i < STATUS_POLL_TRIES; i++) {
        const stUrl =
          `${api}/${creationId}?` +
          new URLSearchParams({ fields: "status_code", access_token: token }).toString();
        const stRes = await fetch(stUrl);
        if (!stRes.ok) throw await igError("media(status)", stRes);
        const st = (await stRes.json()) as { status_code?: string };
        if (st.status_code === "FINISHED") break;
        if (st.status_code === "ERROR" || st.status_code === "EXPIRED") {
          throw new Error(`Instagram: контейнер у статусі ${st.status_code} (перевірте зображення/права)`);
        }
        if (i === STATUS_POLL_TRIES - 1) {
          throw new InstagramError("Instagram: контейнер не став FINISHED вчасно", 504, true);
        }
        await sleep(STATUS_POLL_DELAY_MS);
      }

      // Крок 3: опублікувати контейнер → media id.
      const pubUrl =
        `${api}/${igUserId}/media_publish?` +
        new URLSearchParams({ creation_id: creationId, access_token: token }).toString();
      const pubRes = await fetch(pubUrl, { method: "POST" });
      if (!pubRes.ok) throw await igError("media_publish", pubRes);
      const published = (await pubRes.json()) as { id?: string };
      const mediaId = published.id;
      if (!mediaId) throw new Error("Instagram: media_publish без id");

      // Крок 4: дістати permalink опублікованого поста (для UI-посилання). Не критично — фолбек на id.
      let permalink = `https://www.instagram.com/`;
      try {
        const plUrl =
          `${api}/${mediaId}?` +
          new URLSearchParams({ fields: "permalink", access_token: token }).toString();
        const plRes = await fetch(plUrl);
        if (plRes.ok) {
          const pl = (await plRes.json()) as { permalink?: string };
          if (pl.permalink) permalink = pl.permalink;
        }
      } catch {
        // permalink — best-effort; id уже є.
      }

      return { externalPostId: mediaId, externalUrl: permalink };
    },
  };
}
