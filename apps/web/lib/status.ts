// Єдина точка правди для доменних статусів → візуальний варіант (DS §3, §9).
// Імпортуємо enum-и з контракту @forteq/shared, щоб мапінг не розсинхронився з api.
import { RUN_STATUSES, ITEM_STATUSES, PLAN_ENTRY_STATUSES } from "@forteq/shared";

// Типи статусів виводимо з const-масивів контракту (єдине джерело значень).
export type RunStatus = (typeof RUN_STATUSES)[number];
export type ItemStatus = (typeof ITEM_STATUSES)[number];
export type PlanEntryStatus = (typeof PLAN_ENTRY_STATUSES)[number];

// Тон = семантичний колір бейджа (мапиться на variant у components/ui/badge.tsx).
export type StatusTone = "muted" | "info" | "success" | "warning" | "destructive";

export interface StatusVisual {
  tone: StatusTone;
  label: string; // українською (DS §8)
  pulse: boolean; // пульсація для активних станів (running/generating)
  outline: boolean; // outline-стиль (proposed, flagged) — DS §3
}

// run_status (DS §3)
const RUN_STATUS_VISUAL: Record<RunStatus, StatusVisual> = {
  queued: { tone: "muted", label: "У черзі", pulse: false, outline: false },
  running: { tone: "info", label: "Виконується", pulse: true, outline: false },
  needs_review: { tone: "warning", label: "На рецензії", pulse: false, outline: false },
  approved: { tone: "success", label: "Схвалено", pulse: false, outline: false },
  rejected: { tone: "destructive", label: "Відхилено", pulse: false, outline: false },
  failed: { tone: "destructive", label: "Помилка", pulse: false, outline: false },
};

// item_status (DS §3)
const ITEM_STATUS_VISUAL: Record<ItemStatus, StatusVisual> = {
  draft: { tone: "muted", label: "Чернетка", pulse: false, outline: false },
  approved: { tone: "success", label: "Схвалено", pulse: false, outline: false },
  rejected: { tone: "destructive", label: "Відхилено", pulse: false, outline: false },
  needs_revision: { tone: "warning", label: "Потребує правок", pulse: false, outline: false },
};

// plan_entry.status (DS §3)
const PLAN_ENTRY_STATUS_VISUAL: Record<PlanEntryStatus, StatusVisual> = {
  proposed: { tone: "muted", label: "Запропоновано", pulse: false, outline: true },
  approved: { tone: "info", label: "Погоджено", pulse: false, outline: false },
  scheduled: { tone: "info", label: "Заплановано", pulse: false, outline: false },
  generating: { tone: "info", label: "Генерується", pulse: true, outline: false },
  generated: { tone: "success", label: "Згенеровано", pulse: false, outline: false },
  skipped: { tone: "muted", label: "Пропущено", pulse: false, outline: false },
};

export function runStatusVisual(status: RunStatus): StatusVisual {
  return RUN_STATUS_VISUAL[status];
}

export function itemStatusVisual(status: ItemStatus): StatusVisual {
  return ITEM_STATUS_VISUAL[status];
}

export function planEntryStatusVisual(status: PlanEntryStatus): StatusVisual {
  return PLAN_ENTRY_STATUS_VISUAL[status];
}

// «flagged» — НЕ статус (див. контракт): похідне від violations.length > 0.
// Стиль — warning outline (DS §3). Повертає null, коли порушень немає.
export const FLAGGED_VISUAL: StatusVisual = {
  tone: "warning",
  label: "Порушення",
  pulse: false,
  outline: true,
};

export function flaggedVisual(violationsCount: number): StatusVisual | null {
  return violationsCount > 0 ? FLAGGED_VISUAL : null;
}

// ── Предикати активності run (єдине джерело для polling-логіки, §8.3/§9) ──────────
// Термінальні статуси — прогін завершений, polling вимикається назавжди.
const RUN_TERMINAL: ReadonlySet<RunStatus> = new Set(["approved", "rejected", "failed"]);

// Термінальний = approved | rejected | failed.
export function isRunTerminal(status: RunStatus): boolean {
  return RUN_TERMINAL.has(status);
}

// Список ранів поллиться, поки є хоч один НЕ термінальний (queued|running|needs_review).
export function hasActiveRun(runs: ReadonlyArray<{ status: RunStatus }>): boolean {
  return runs.some((r) => !isRunTerminal(r.status));
}

// Деталь run поллить лише поки граф реально працює (queued|running); needs_review — стоп (чекає людину, §9).
export function isRunGenerating(status?: RunStatus): boolean {
  return status === "queued" || status === "running";
}
