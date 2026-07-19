// Витягування тексту зі сторінки компанії для AI-bootstrap (§6 раунд 2).
//
// Живе у worker, а не в пайплайні: це мережевий side effect, а пайплайн їх не робить (ADR-0004).
// Пайплайн отримує вже видобутий текст аргументом.
//
// Свідомо БЕЗ парсера HTML: додавати залежність заради одного виклику надлишково, а для брифу
// достатньо грубого зняття тегів — нам потрібні слова, а не структура документа.

const FETCH_TIMEOUT_MS = 10_000;
const MAX_BYTES = 512 * 1024;

/** Блоки, вміст яких — не текст сторінки. Без цього у бриф їде мініфікований JS. */
const DROP_BLOCKS = /<(script|style|noscript|svg|template)[\s\S]*?<\/\1>/gi;

export function htmlToText(html: string): string {
  return html
    .replace(DROP_BLOCKS, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Завантажує сторінку і повертає текст. Повертає null замість помилки: недоступний сайт —
 * очікуваний випадок (друкарка в URL, сайт за Cloudflare, таймаут), і він НЕ має валити
 * онбординг. Користувач усе одно може дати опис одним рядком.
 */
export async function fetchSiteText(url: string): Promise<string | null> {
  let parsed: URL;
  try {
    parsed = new URL(url.startsWith("http") ? url : `https://${url}`);
  } catch {
    return null;
  }
  // Лише http(s): інші схеми (file:, ftp:) відкрили б доступ до локальних ресурсів воркера.
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(parsed.toString(), {
      signal: ctrl.signal,
      redirect: "follow",
      headers: { "user-agent": "ForteqBot/1.0 (+onboarding)" },
    });
    if (!res.ok) return null;

    const type = res.headers.get("content-type") ?? "";
    if (!type.includes("text/html") && !type.includes("text/plain")) return null;

    // Обмежуємо розмір ДО читання цілком: сторінка на десятки мегабайт заблокувала б воркер.
    const buf = await res.arrayBuffer();
    const html = new TextDecoder().decode(buf.slice(0, MAX_BYTES));
    const text = htmlToText(html);
    return text.length > 0 ? text : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
