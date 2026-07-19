import { Worker, type Job as BullJob } from "bullmq";
import { job as jobSchema } from "@forteq/shared";
import { parseEnv } from "./config/env.js";
import { QUEUE_NAMES, createJobProducer, createRedisConnection } from "./queue.js";
import { buildDeps } from "./composition.js";
import { route } from "./router.js";

// Bootstrap checkpointer'а (§10): PostgresSaver.setup() створює checkpoint-таблиці (DDL).
// B2-фікс: setup() вимагає CREATE, якого нема у рантайм-forteq_app (§2.10.1) — тому у рантаймі
// його ПРОПУСКАЄМО (див. main). Провізіонінг таблиць — окремий owner-крок `setup:checkpointer`.
// Прапорець CHECKPOINTER_SETUP=1 лишає escape-hatch (напр., owner-конект у DATABASE_URL для dev).
async function setupCheckpointer(cp: unknown): Promise<void> {
  const s = cp as { setup?: () => Promise<void> };
  if (typeof s.setup === "function") await s.setup();
}

// Точка входу worker'а: BullMQ Worker на черзі QUEUE_NAMES.jobs (spike-1 §13).
async function main(): Promise<void> {
  const env = parseEnv(); // валідація env — падаємо на старті, якщо конфіг невалідний (§6)
  const deps = buildDeps(env);

  // §10: checkpoint-таблиці мають існувати ДО прийому job'ів (інакше перший interrupt впаде).
  // B2-фікс: рантайм-worker (forteq_app без CREATE) setup НЕ робить — таблиці провізіонить owner
  // через `pnpm --filter @forteq/worker setup:checkpointer`. Тут — лише опційний escape-hatch.
  if (env.CHECKPOINTER_SETUP === "1") {
    await setupCheckpointer(deps.pipeline.checkpointer);
    deps.logger.info({}, "checkpointer ready (setup)");
  } else {
    deps.logger.info(
      {},
      "checkpointer setup skipped (CHECKPOINTER_SETUP != 1) — provision via `setup:checkpointer` (owner)",
    );
  }

  const connection = createRedisConnection(env.REDIS_URL);

  // Продюсер follow-up job (§7.4): worker сам ставить content.visuals після прогону.
  // Окремий конект — BullMQ Worker тримає свій у блокуючих командах.
  const producerConnection = createRedisConnection(env.REDIS_URL);
  const producer = createJobProducer(producerConnection, deps.logger);

  deps.logger.info(
    { queue: QUEUE_NAMES.jobs, concurrency: env.WORKER_CONCURRENCY },
    "worker starting",
  );

  const worker = new Worker(
    QUEUE_NAMES.jobs,
    async (bullJob: BullJob) => {
      // 1) Парсинг + валідація payload через zod-контракт черги (@forteq/shared jobs.ts).
      const parsed = jobSchema.parse(bullJob.data);
      deps.logger.info(
        { kind: parsed.kind, jobId: parsed.jobId, accountId: parsed.accountId },
        "job received",
      );

      // 2) Роутимо БЕЗ відкриття довгоживучої транзакції: кожен хендлер відкриває ВЛАСНІ короткі
      //    scoped-txn (withAccountScope, RLS SET LOCAL app.current_account_id) навколо доступів до БД,
      //    але НЕ тримає їх під час виконання графа (LLM ідуть хвилинами, §13). accountId несемо у ctx.
      await route(parsed, { ...deps, producer, accountId: parsed.accountId });
    },
    { connection, concurrency: env.WORKER_CONCURRENCY },
  );

  worker.on("completed", (j) => deps.logger.info({ jobId: j?.id }, "job completed"));
  worker.on("failed", (j, err) =>
    deps.logger.error({ jobId: j?.id, err: err?.message }, "job failed"),
  );

  // Плавне завершення: закриваємо worker і конект на сигнал.
  const shutdown = async (signal: string): Promise<void> => {
    deps.logger.info({ signal }, "worker shutting down");
    await worker.close();
    await producer.close();
    await producerConnection.quit();
    await connection.quit();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((err) => {
  // Помилка старту (напр. невалідний env) — логуємо і виходимо з ненульовим кодом.
  console.error("worker failed to start:", err);
  process.exit(1);
});
