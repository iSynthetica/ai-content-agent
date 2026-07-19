// Каталог доменних подій для нотифікацій та inbox (spike-2 §2.13).
//
// Навіщо окремий модуль у shared: події емітять ДВА застосунки — api (дії людини) і worker
// (завершення фонових прогонів). Межа між ними тверда, спільного сервісу вони мати не можуть,
// тож без єдиного каталогу формулювання й типи неминуче розійшлися б: worker писав би
// "run_completed", api — "run.completed", а UI мусив би знати обидва.
// Тут — ЛИШЕ семантика (тип + текст + куди веде). Запис у таблиці робить кожна сторона сама,
// під своїм RLS-скоупом.

// Два різні концепти (§2.13): notification — інформує, inbox item — вимагає дії.
export const NOTIFICATION_TYPES = {
  runCompleted: "run.completed",
  runFailed: "run.failed",
  runApproved: "run.approved",
  runRejected: "run.rejected",
} as const;

export const INBOX_TYPES = {
  runNeedsReview: "run.needs_review",
  runFailed: "run.failed",
} as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[keyof typeof NOTIFICATION_TYPES];
export type InboxType = (typeof INBOX_TYPES)[keyof typeof INBOX_TYPES];

function plural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

export function postsWord(n: number): string {
  return plural(n, "пост", "пости", "постів");
}

/** Прогін завершився без потреби в рецензії (усе схвалено автоматично). */
export function runCompletedEvent(input: { runId: string; items: number; costCents: number }) {
  return {
    type: NOTIFICATION_TYPES.runCompleted,
    title: `Прогін завершено: ${input.items} ${postsWord(input.items)}`,
    body: `Вартість: $${(input.costCents / 100).toFixed(2)}`,
    data: { runId: input.runId, items: input.items },
  };
}

/** Прогін впав. Це ІНФОРМАЦІЯ + ЗАДАЧА: людині треба вирішити, чи перезапускати. */
export function runFailedEvent(input: { runId: string; error?: string }) {
  return {
    type: NOTIFICATION_TYPES.runFailed,
    title: "Прогін завершився помилкою",
    body: input.error ?? null,
    data: { runId: input.runId },
  };
}

export function runFailedInbox(input: { runId: string; companyId: string; error?: string }) {
  return {
    type: INBOX_TYPES.runFailed,
    title: "Прогін впав — потрібен перезапуск",
    entityType: "generation_run",
    entityId: input.runId,
    companyId: input.companyId,
    data: { runId: input.runId, error: input.error ?? null },
  };
}

/** Головна actionable-подія МВП: пости згенеровані й чекають на рішення людини (HITL). */
export function runNeedsReviewInbox(input: {
  runId: string;
  companyId: string;
  items: number;
  flagged: number;
}) {
  const base = `Перевірте ${input.items} ${postsWord(input.items)}`;
  return {
    type: INBOX_TYPES.runNeedsReview,
    title: input.flagged > 0 ? `${base} · ${input.flagged} з зауваженнями` : base,
    entityType: "generation_run",
    entityId: input.runId,
    companyId: input.companyId,
    data: { runId: input.runId, items: input.items, flagged: input.flagged },
  };
}

/** Рішення людини по прогону — інформаційний слід у стрічці. */
export function runDecidedEvent(input: { runId: string; approved: boolean }) {
  return {
    type: input.approved ? NOTIFICATION_TYPES.runApproved : NOTIFICATION_TYPES.runRejected,
    title: input.approved ? "Прогін схвалено" : "Прогін відхилено",
    body: null,
    data: { runId: input.runId },
  };
}

// Deep-link для inbox-задачі: UI не має сам вгадувати, куди вести задачу даного типу.
export function inboxDeepLink(entityType: string | null, entityId: string | null): string | null {
  if (entityType === "generation_run" && entityId) return `/runs/${entityId}`;
  return null;
}
