// fillTemplate (§6 spike-1) — підстановка {placeholder} → значення.
// Невідомі плейсхолдери лишаються як є (не падаємо на відсутньому ключі — промпти толерантні).
export function fillTemplate(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(values, key) ? values[key] : match,
  );
}
