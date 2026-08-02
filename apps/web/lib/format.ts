// Хелпери форматування (дати, гроші) для UI. БЕЗ статус-кольорів — ті живуть у lib/status.ts
// (DS §3, єдина точка). Тут — суто презентаційна нормалізація значень контракту.
import type { Language } from "@/lib/i18n/types";

const LOCALE_BY_LANGUAGE: Record<Language, string> = { en: "en-US", uk: "uk-UA" };

const dateTimeFmtCache: Partial<Record<Language, Intl.DateTimeFormat>> = {};
const dateFmtCache: Partial<Record<Language, Intl.DateTimeFormat>> = {};

// language — мова UI (DEFAULT_LANGUAGE = "en" за відсутності cookie); викличники передають
// t/useLanguage().language. Дефолт параметра лишаємо "uk" — старі виклики без аргументу
// поводяться як раніше (нічого не ламаємо там, де мову ще не прокинули).
export function formatDateTime(iso: string | null | undefined, language: Language = "uk"): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const fmt = (dateTimeFmtCache[language] ??= new Intl.DateTimeFormat(LOCALE_BY_LANGUAGE[language], {
    dateStyle: "medium",
    timeStyle: "short",
  }));
  return fmt.format(d);
}

export function formatDate(iso: string | null | undefined, language: Language = "uk"): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const fmt = (dateFmtCache[language] ??= new Intl.DateTimeFormat(LOCALE_BY_LANGUAGE[language], {
    dateStyle: "medium",
  }));
  return fmt.format(d);
}

// costCents — вартість прогону в центах (контракт runDTO.costCents). Показуємо у доларах, 2 знаки.
export function formatCost(cents: number | null | undefined): string {
  if (cents == null) return "—";
  return `$${(cents / 100).toFixed(2)}`;
}
