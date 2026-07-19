// Читання стрічки нотифікацій та inbox (§2.13, B11a). Окремо від NotificationService, бо це
// РІЗНІ ролі: NotificationService — producer (пише події), цей сервіс — consumer (читає для UI).
// Змішувати їх означало б дати ендпоінтам читання доступ до емісії, чого їм не треба.
import { AppError } from "../http/errors";
import type { AuthCtx } from "../di/types";
import type { InboxItemsRepo, NotificationsRepo } from "../repositories/interfaces";

const FEED_LIMIT = 50;

export class NotificationsFeedService {
  constructor(
    private readonly notifications: NotificationsRepo,
    private readonly inbox: InboxItemsRepo,
  ) {}

  async listNotifications(ctx: AuthCtx) {
    const [items, unreadCount] = await Promise.all([
      this.notifications.list(ctx.accountId, ctx.userId, FEED_LIMIT),
      this.notifications.countUnread(ctx.accountId, ctx.userId),
    ]);
    return { items, unreadCount };
  }

  async markRead(ctx: AuthCtx, id: string): Promise<void> {
    await this.notifications.markRead(ctx.accountId, id);
  }

  async markAllRead(ctx: AuthCtx): Promise<void> {
    await this.notifications.markAllRead(ctx.accountId, ctx.userId);
  }

  async listInbox(ctx: AuthCtx) {
    const [items, openCount] = await Promise.all([
      this.inbox.listOpen(ctx.accountId, FEED_LIMIT),
      this.inbox.countOpen(ctx.accountId),
    ]);
    return { items, openCount };
  }

  // 404 (а не тихий no-op) на неіснуючу/вже закриту задачу: інакше подвійний клік у UI виглядав
  // би як успіх, і неможливо було б відрізнити «закрив я» від «закрив хтось інший паралельно».
  async resolveInbox(ctx: AuthCtx, id: string): Promise<void> {
    const ok = await this.inbox.resolve(ctx.accountId, id, ctx.userId);
    if (!ok) throw AppError.notFound("inbox item");
  }
}
