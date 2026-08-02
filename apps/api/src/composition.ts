import { createDb, withAccountContext, parseMasterKey, type DB } from "@forteq/db";
import { pino, type Logger } from "pino";
import type { AppConfig } from "./config/env";
import type { AuthCtx, AfterCommit, AfterCommitHook, Ports } from "./di/types";
import { buildRepos, buildRequestScope, type RequestScope } from "./di/request-scope";
import { BullMqQueueAdapter } from "./adapters/bullmq-queue.adapter";
import { LocalImageStorageAdapter } from "./adapters/local-image-storage.adapter";
import { createAuth, type Auth } from "./auth/better-auth";

// Composition root — ручний DI (spike-2 §2.1, §4.1). ЄДИНЕ місце, де щось інстанціюється.
// Двоярусний через RLS: ярус застосунку (config/db-пул/logger/ports/auth — синглтони) +
// ярус запиту (репо/сервіси, build на кожен запит поверх tx з SET LOCAL, §2.10). Жодних глобальних
// синглтон-репо, жодного `new` всередині сервісів — усі залежності через конструктор.

// Ярус застосунку (синглтони). openScope — фабрика request-scope: приймає auth-контекст, відкриває
// UnitOfWork (BEGIN + SET LOCAL) і будує репо/сервіси на цьому tx; після COMMIT виконує
// after-commit-хуки на СВІЖИХ транзакціях (enqueue у BullMQ — строго після коміту, §2.7/§2.10.3).
export interface Composition {
  config: AppConfig;
  db: DB;
  logger: Logger;
  ports: Ports;
  auth: Auth;
  openScope: <T>(auth: AuthCtx, fn: (scope: RequestScope) => Promise<T>) => Promise<T>;
  close: () => Promise<void>;
}

export function buildComposition(config: AppConfig): Composition {
  const logger = pino({
    level: config.LOG_LEVEL,
    // NFR-4.1: секрети ніколи в лог — redact-список (§5.1).
    redact: {
      paths: ["req.headers.authorization", "req.headers.cookie", "*.password", "*.secret"],
      remove: true,
    },
  });

  // Єдиний конект застосунку — роль forteq_app (non-superuser під RLS, §2.10.1).
  const db = createDb(config.DATABASE_URL);

  // Реальні адаптери зовнішніх меж (§2.3). BullMQ — тверда межа api→черга; local image storage — МВП.
  const queue = new BullMqQueueAdapter(config.REDIS_URL, logger);
  const imageStorage = new LocalImageStorageAdapter(
    config.IMAGE_STORAGE_DIR,
    config.PUBLIC_BASE_URL ?? `http://localhost:${config.API_PORT}`,
  );
  const ports: Ports = { queue, imageStorage };

  // Better Auth self-host (email+password, ba_-таблиці) — синглтон, залежність, не глобал (§2.8).
  const auth = createAuth(db, config);

  // BYOK master-ключ (§ADR-0016): парситься РАЗ на старті; невалідна довжина валить процес одразу,
  // а не на першому записі ключа орендаря. Замикається у request-scope через buildRequestScope.
  const masterKey = parseMasterKey(config.BYOK_ENCRYPTION_KEY);

  // openScope (§4.1): одна request-txn з SET LOCAL app.current_* → request-scoped scope → COMMIT.
  // Після коміту — after-commit-хуки, КОЖЕН на новій withAccountContext-txn зі свіжими репо
  // (request-tx уже закрито; enqueue/markи пишуться на живому tx2, §2.10.3).
  const openScope = async <T>(
    authCtx: AuthCtx,
    fn: (scope: RequestScope) => Promise<T>,
  ): Promise<T> => {
    const hooks: AfterCommitHook[] = [];
    const afterCommit: AfterCommit = (hook) => {
      hooks.push(hook);
    };

    const result = await withAccountContext(db, authCtx, (tx) =>
      fn(buildRequestScope(tx, authCtx, afterCommit, ports, logger, masterKey)),
    );

    for (const hook of hooks) {
      try {
        await withAccountContext(db, authCtx, (tx2) =>
          hook({ repos: buildRepos(tx2), ports, logger }),
        );
      } catch (err) {
        // Збій хука НЕ відкочує вже закоммічені дані; лог (у Фазі 3 — reconciliation-sweep, §2.7.1).
        logger.error({ err }, "afterCommit hook failed");
      }
    }
    return result;
  };

  const close = async (): Promise<void> => {
    await queue.close();
  };

  return { config, db, logger, ports, auth, openScope, close };
}
