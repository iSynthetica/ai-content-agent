// Ядро типів DI (spike-2 §2.1, §4.1). Двоярусний ручний composition root:
// ярус застосунку (синглтони) + ярус запиту (request-scoped репо/сервіси поверх tx з SET LOCAL).
import type { DB, TenantContext } from "@forteq/db";
import type { QueuePort } from "../ports/queue.port";
import type { ImageStoragePort } from "../ports/image-storage.port";
import type { Repos } from "../repositories/interfaces";
import type { Logger } from "pino";

export type { Logger };

// DbExecutor — те, на чому працюють репозиторії: пул або request-scoped tx (§4.1).
// tx з withAccountContext не несе $client, тож знімаємо його з типу пулу.
export type DbExecutor = Omit<DB, "$client">;

// AuthCtx — { accountId, userId, role } з auth-middleware (§2.8).
export type AuthCtx = TenantContext;

export interface PageParams {
  page: number;
  pageSize: number;
}
export interface Paged<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

// Порти — стабільний ярус застосунку (синглтони). Реальні адаптери — у composition root.
export interface Ports {
  queue: QueuePort;
  imageStorage: ImageStoragePort;
}

// PostCommitScope — те, що бачить after-commit-хук: СВІЖІ репо на новій txn + порти + logger
// (§2.10.3, §4.1). enqueue виконується ВСЕРЕДИНІ хука через ports.queue, уже після COMMIT.
export interface PostCommitScope {
  repos: Repos;
  ports: Ports;
  logger: Logger;
}
export type AfterCommitHook = (scope: PostCommitScope) => Promise<void>;
export type AfterCommit = (hook: AfterCommitHook) => void;
