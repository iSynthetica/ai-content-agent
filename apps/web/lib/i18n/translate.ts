import { en } from "./messages/en";
import type { Language } from "./types";

// Українське джерело — єдина мапа istyny. Для "en" шукаємо переклад; немає перекладу → повертаємо
// український оригінал (не зламаний ключ) — часткова покритість словника завжди безпечна.
export function translate(language: Language, source: string): string {
  if (language === "uk") return source;
  return en[source] ?? source;
}
