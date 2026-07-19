import type { Logger } from "pino";
import type { InboxItemsRepo, NotificationsRepo } from "../repositories/interfaces";

// interface NotificationService (spike-2 §2.13, B4) — оголошується РАНО: домен-сервіси залежать
// від контракту, а не від реалізації. Це розриває кільце B9/B11 ↔ B11a. РЕАЛІЗАЦІЯ (+ repo +
// ендпоінти notifications/inbox) — Фаза 3 (B11a). Тут — контракт + no-op стаб.

export interface NotifyInput {
  accountId: string;
  userId?: string | null;
  type: string;
  title: string;
  body?: string | null;
  data?: Record<string, unknown> | null;
}
export interface OpenInboxInput {
  accountId: string;
  companyId?: string | null;
  type: string;
  title: string;
  entityType: string;
  entityId: string;
  assigneeId?: string | null;
  data?: Record<string, unknown> | null;
}

export interface NotificationService {
  notify(input: NotifyInput): Promise<void>;
  openInboxItem(input: OpenInboxInput): Promise<void>;
  resolveInboxItem(accountId: string, id: string, resolvedBy: string): Promise<void>;
  // Автозакриття всіх відкритих задач по сутності (напр. рішення по прогону закриває «перевірте N постів»).
  resolveForEntity(accountId: string, entityId: string, resolvedBy: string | null): Promise<void>;
}

/**
 * Реалізація Фази 3 (B11a) — ЄДИНИЙ producer нотифікацій та inbox-задач (§2.13).
 *
 * Чому «єдиний»: події емітять і api-сервіси, і worker. Якби кожен писав у таблиці напряму,
 * правила ідемпотентності й автозакриття довелось би дублювати у двох місцях і вони б розійшлись.
 *
 * Помилка емісії НЕ валить основну операцію: прогін, що успішно завершився, не повинен
 * «зламатись» через те, що не записалась інформаційна нотифікація.
 */
export class NotificationServiceImpl implements NotificationService {
  constructor(
    private readonly notifications: NotificationsRepo,
    private readonly inbox: InboxItemsRepo,
    private readonly logger: Logger,
  ) {}

  async notify(input: NotifyInput): Promise<void> {
    try {
      await this.notifications.insert(input);
    } catch (e) {
      this.logger.error(
        { type: input.type, err: e instanceof Error ? e.message : String(e) },
        "не вдалося записати нотифікацію",
      );
    }
  }

  async openInboxItem(input: OpenInboxInput): Promise<void> {
    try {
      // Ідемпотентність: повторний виклик по тій самій сутності не створює другу задачу.
      const existing = await this.inbox.findOpenByEntity(input.accountId, input.type, input.entityId);
      if (existing) return;
      await this.inbox.insert(input);
    } catch (e) {
      this.logger.error(
        { type: input.type, entityId: input.entityId, err: e instanceof Error ? e.message : String(e) },
        "не вдалося відкрити inbox-задачу",
      );
    }
  }

  async resolveInboxItem(accountId: string, id: string, resolvedBy: string): Promise<void> {
    await this.inbox.resolve(accountId, id, resolvedBy);
  }

  /** Автозакриття задач по сутності — коли рішення вже ухвалене, задача не має висіти. */
  async resolveForEntity(accountId: string, entityId: string, resolvedBy: string | null): Promise<void> {
    try {
      await this.inbox.resolveByEntity(accountId, entityId, resolvedBy);
    } catch (e) {
      this.logger.error(
        { entityId, err: e instanceof Error ? e.message : String(e) },
        "не вдалося закрити inbox-задачі сутності",
      );
    }
  }
}

// СТАБ — лишається для тестів і для шляхів, де емісія свідомо не потрібна.
export class NotificationServiceStub implements NotificationService {
  constructor(private readonly logger: Logger) {}

  async notify(input: NotifyInput): Promise<void> {
    this.logger.debug({ notify: input.type, accountId: input.accountId }, "notify (stub, Фаза 3)");
  }

  async openInboxItem(input: OpenInboxInput): Promise<void> {
    this.logger.debug({ inbox: input.type, entityId: input.entityId }, "openInboxItem (stub, Фаза 3)");
  }

  async resolveInboxItem(accountId: string, id: string): Promise<void> {
    this.logger.debug({ accountId, id }, "resolveInboxItem (stub)");
  }

  async resolveForEntity(accountId: string, entityId: string): Promise<void> {
    this.logger.debug({ accountId, entityId }, "resolveForEntity (stub)");
  }
}
