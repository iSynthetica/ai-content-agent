// Емісія доменних подій з worker'а (§2.13, B11a).
//
// Worker не може використати NotificationService з apps/api — межа між застосунками тверда.
// Тому тут власний тонкий писач, а СЕМАНТИКА подій (тип, текст, deep-link) береться з
// каталогу @forteq/shared/events — спільного для api і worker. Так формулювання не розходяться,
// хоч запис і робить кожна сторона сама, під своїм RLS-скоупом.
//
// Головний інваріант: помилка емісії НЕ валить прогін. Прогін, що успішно завершився і зберіг
// пости, не має вважатись невдалим через ненаписану нотифікацію.
import { and, eq } from "drizzle-orm";
import { inboxItems, notifications } from "@forteq/db";
import type { Tx } from "../composition.js";

export interface NotifyRow {
  type: string;
  title: string;
  body?: string | null;
  data?: Record<string, unknown> | null;
}

export interface InboxRow {
  type: string;
  title: string;
  entityType: string;
  entityId: string;
  companyId?: string | null;
  data?: Record<string, unknown> | null;
}

export async function writeNotification(
  tx: Tx,
  accountId: string,
  row: NotifyRow,
): Promise<void> {
  await tx.insert(notifications).values({
    accountId,
    userId: null, // акаунт-широка: фонову подію бачать усі учасники
    type: row.type,
    title: row.title,
    body: row.body ?? null,
    data: row.data ?? null,
  });
}

/**
 * Відкриває inbox-задачу ІДЕМПОТЕНТНО. Це не оптимізація, а вимога коректності: BullMQ ретраїть
 * job'и, і без перевірки кожен ретрай додавав би ще одну задачу «перевірте N постів» на той
 * самий прогін — inbox швидко перетворився б на смітник дублікатів.
 */
export async function openInbox(tx: Tx, accountId: string, row: InboxRow): Promise<void> {
  const [existing] = await tx
    .select({ id: inboxItems.id })
    .from(inboxItems)
    .where(
      and(
        eq(inboxItems.accountId, accountId),
        eq(inboxItems.type, row.type),
        eq(inboxItems.entityId, row.entityId),
        eq(inboxItems.status, "open"),
      ),
    )
    .limit(1);
  if (existing) return;

  await tx.insert(inboxItems).values({
    accountId,
    companyId: row.companyId ?? null,
    type: row.type,
    title: row.title,
    entityType: row.entityType,
    entityId: row.entityId,
    data: row.data ?? null,
  });
}

/**
 * Закриває всі відкриті задачі по сутності. Потрібне, коли стан сутності змінився і задача
 * втратила сенс: людина ухвалила рішення по прогону → «перевірте N постів» має зникнути сама,
 * а не висіти, доки хтось не закриє її вручну.
 */
export async function resolveInboxForEntity(
  tx: Tx,
  accountId: string,
  entityId: string,
): Promise<void> {
  await tx
    .update(inboxItems)
    .set({ status: "resolved", resolvedAt: new Date(), resolvedBy: null })
    .where(
      and(
        eq(inboxItems.accountId, accountId),
        eq(inboxItems.entityId, entityId),
        eq(inboxItems.status, "open"),
      ),
    );
}
