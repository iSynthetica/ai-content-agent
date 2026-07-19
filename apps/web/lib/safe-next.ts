// Санітизація параметра `next` проти open-redirect (spike-3 §5). Приймаємо ЛИШЕ
// відносний same-origin шлях: починається з одного `/`, не `//` (protocol-relative)
// і не містить `://` (абсолютний URL). Інакше — дефолт `/`.
// Одна чиста функція — і в /login (редірект після логіну), і в middleware (кладення next).
export function safeNext(raw: string | null | undefined): string {
  if (!raw) return "/";
  if (!raw.startsWith("/")) return "/";
  if (raw.startsWith("//")) return "/";
  if (raw.includes("://")) return "/";
  return raw;
}
