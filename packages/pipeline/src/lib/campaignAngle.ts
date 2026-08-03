import type { CompanyContext } from "../types";

// Директива акценту кампанії (per-run angle, §Phase 2 проводка). Дописується у кінець промпта
// strategist/writer. Порожній рядок, коли акцент не заданий, — жодного шуму в промпті.
// Свідомо ДИРЕКТИВА, а не «факт»: не змінює бренд-фактів, лише задає кут подачі.
export function campaignAngleDirective(company: CompanyContext): string {
  const angle = company.campaignAngle?.trim();
  if (!angle) return "";
  return (
    `\n\nАКЦЕНТ КАМПАНІЇ (на цей прогін): ${angle}\n` +
    "Витримуй цей акцент/кут у виборі теми й подачі. Це НЕ новий факт — бренд-факти вище не змінюй."
  );
}
