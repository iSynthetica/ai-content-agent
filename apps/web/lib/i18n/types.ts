// Мова UI (не мова генерації контенту — та живе окремо в @forteq/shared GENERATION_LANGUAGES).
// English — дефолт і джерело фолбеку немає (словник en.ts мапить uk → en); Ukrainian — джерело
// рядків у коді, тому для неї переклад не потрібен (identity).
export type Language = "en" | "uk";

export const DEFAULT_LANGUAGE: Language = "en";

export const LANGUAGES: ReadonlyArray<{ code: Language; label: string }> = [
  { code: "en", label: "English" },
  { code: "uk", label: "Українська" },
];

export function isLanguage(value: string | undefined | null): value is Language {
  return value === "en" || value === "uk";
}
