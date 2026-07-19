// Репозиторій нотифікацій та inbox (spike-2 §2.13, B11a). Два РІЗНІ концепти в одному файлі,
// бо в них спільний власник (NotificationService) і спільна межа скоупу:
//   • notifications — інформаційні, дзвіночок, мають лише read/unread;
//   • inbox_items   — actionable, живуть у станах open|resolved і чекають на дію людини.
// Як і решта репо — НЕ синглтон: будується на request-scoped tx з уже виставленим RLS-GUC.
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { inboxItems, notifications } from "@forteq/db";
import type { DbExecutor } from "../di/types";
import type {
  InboxItemRow,
  InboxItemsRepo,
  NotificationRow,
  NotificationsRepo,
  OpenInboxRow,
} from "./interfaces";

export class DrizzleNotificationsRepo implements NotificationsRepo {
  constructor(private readonly tx: DbExecutor) {}

  async insert(row: {
    accountId: string;
    userId?: string | null;
    type: string;
    title: string;
    body?: string | null;
    data?: Record<string, unknown> | null;
  }): Promise<void> {
    await this.tx.insert(notifications).values({
      accountId: row.accountId,
      userId: row.userId ?? null,
      type: row.type,
      title: row.title,
      body: row.body ?? null,
      data: row.data ?? null,
    });
  }

  // Стрічка дзвіночка: акаунт-широкі (user_id IS NULL) + адресовані саме цьому користувачу.
  async list(accountId: string, userId: string, limit: number): Promise<NotificationRow[]> {
    const rows = await this.tx
      .select()
      .from(notifications)
      .where(
        and(
          eq(notifications.accountId, accountId),
          sql`(${notifications.userId} IS NULL OR ${notifications.userId} = ${userId})`,
        ),
      )
      .orderBy(desc(notifications.createdAt))
      .limit(limit);

    return rows.map((r) => ({
      id: r.id,
      type: r.type,
      title: r.title,
      body: r.body,
      data: r.data ?? null,
      readAt: r.readAt ? r.readAt.toISOString() : null,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  async countUnread(accountId: string, userId: string): Promise<number> {
    const [row] = await this.tx
      .select({ n: sql<number>`count(*)::int` })
      .from(notifications)
      .where(
        and(
          eq(notifications.accountId, accountId),
          isNull(notifications.readAt),
          sql`(${notifications.userId} IS NULL OR ${notifications.userId} = ${userId})`,
        ),
      );
    return row?.n ?? 0;
  }

  async markRead(accountId: string, id: string): Promise<void> {
    await this.tx
      .update(notifications)
      .set({ readAt: new Date() })
      .where(and(eq(notifications.accountId, accountId), eq(notifications.id, id)));
  }

  async markAllRead(accountId: string, userId: string): Promise<void> {
    await this.tx
      .update(notifications)
      .set({ readAt: new Date() })
      .where(
        and(
          eq(notifications.accountId, accountId),
          isNull(notifications.readAt),
          sql`(${notifications.userId} IS NULL OR ${notifications.userId} = ${userId})`,
        ),
      );
  }
}

export class DrizzleInboxRepo implements InboxItemsRepo {
  constructor(private readonly tx: DbExecutor) {}

  // Ідемпотентність (§2.13): повторний виклик для тієї самої сутності НЕ множить задачі.
  // Це не косметика — worker ретраїть job'и, і без цього кожен ретрай прогону додавав би
  // ще один «перевірте N постів» на той самий run.
  async findOpenByEntity(
    accountId: string,
    type: string,
    entityId: string,
  ): Promise<{ id: string } | null> {
    const [row] = await this.tx
      .select({ id: inboxItems.id })
      .from(inboxItems)
      .where(
        and(
          eq(inboxItems.accountId, accountId),
          eq(inboxItems.type, type),
          eq(inboxItems.entityId, entityId),
          eq(inboxItems.status, "open"),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  async insert(row: OpenInboxRow): Promise<void> {
    await this.tx.insert(inboxItems).values({
      accountId: row.accountId,
      companyId: row.companyId ?? null,
      type: row.type,
      title: row.title,
      entityType: row.entityType,
      entityId: row.entityId,
      assigneeId: row.assigneeId ?? null,
      data: row.data ?? null,
    });
  }

  async listOpen(accountId: string, limit: number): Promise<InboxItemRow[]> {
    const rows = await this.tx
      .select()
      .from(inboxItems)
      .where(and(eq(inboxItems.accountId, accountId), eq(inboxItems.status, "open")))
      .orderBy(desc(inboxItems.createdAt))
      .limit(limit);

    return rows.map((r) => ({
      id: r.id,
      companyId: r.companyId,
      type: r.type,
      title: r.title,
      entityType: r.entityType,
      entityId: r.entityId,
      status: r.status,
      data: r.data ?? null,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  async countOpen(accountId: string): Promise<number> {
    const [row] = await this.tx
      .select({ n: sql<number>`count(*)::int` })
      .from(inboxItems)
      .where(and(eq(inboxItems.accountId, accountId), eq(inboxItems.status, "open")));
    return row?.n ?? 0;
  }

  async resolve(accountId: string, id: string, resolvedBy: string): Promise<boolean> {
    const rows = await this.tx
      .update(inboxItems)
      .set({ status: "resolved", resolvedAt: new Date(), resolvedBy })
      .where(
        and(
          eq(inboxItems.accountId, accountId),
          eq(inboxItems.id, id),
          eq(inboxItems.status, "open"),
        ),
      )
      .returning({ id: inboxItems.id });
    return rows.length > 0;
  }

  // Автозакриття при зміні стану сутності (§2.13): коли людина ухвалила рішення по прогону,
  // задача «перевірте N постів» більше не актуальна — вона має зникнути сама, а не висіти,
  // доки хтось не натисне «виконано» вручну.
  async resolveByEntity(accountId: string, entityId: string, resolvedBy: string | null): Promise<void> {
    await this.tx
      .update(inboxItems)
      .set({ status: "resolved", resolvedAt: new Date(), resolvedBy })
      .where(
        and(
          eq(inboxItems.accountId, accountId),
          eq(inboxItems.entityId, entityId),
          eq(inboxItems.status, "open"),
        ),
      );
  }
}
