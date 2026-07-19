// Хелпери форматування (дати, гроші) для UI. БЕЗ статус-кольорів — ті живуть у lib/status.ts
// (DS §3, єдина точка). Тут — суто презентаційна нормалізація значень контракту.

const dateTimeFmt = new Intl.DateTimeFormat("uk-UA", { dateStyle: "medium", timeStyle: "short" });
const dateFmt = new Intl.DateTimeFormat("uk-UA", { dateStyle: "medium" });

// ISO-рядок → «12 лип. 2026, 16:35». Порожнє/невалідне → «—».
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : dateTimeFmt.format(d);
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : dateFmt.format(d);
}

// costCents — вартість прогону в центах (контракт runDTO.costCents). Показуємо у доларах, 2 знаки.
export function formatCost(cents: number | null | undefined): string {
  if (cents == null) return "—";
  return `$${(cents / 100).toFixed(2)}`;
}
