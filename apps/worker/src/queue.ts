import { Queue } from "bullmq";
import IORedis, { type Redis } from "ioredis";
import type { Logger } from "pino";
import type { Job } from "@forteq/shared";

// Назви черг — ЄДИНЕ джерело правди, узгоджене з продюсером (apps/api) і консюмером (apps/worker).
// Усі 4 типи job (discriminated union з @forteq/shared jobs.ts) їдуть однією чергою;
// розрізнення — у router.ts за дискримінантом job.kind.
export const QUEUE_NAMES = {
  jobs: "forteq-jobs",
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

/**
 * Спільний ioredis-конект для BullMQ Worker'а.
 * maxRetriesPerRequest: null — обов'язкова вимога BullMQ для блокуючих команд (BRPOPLPUSH тощо).
 */
export function createRedisConnection(url: string): Redis {
  return new IORedis(url, { maxRetriesPerRequest: null });
}

// ── Продюсер ─────────────────────────────────────────────────────────────────
// Worker досі був ЛИШЕ консюмером. Відколи картинки поїхали з критичного шляху (§7.4),
// generation.start мусить сам поставити follow-up job content.visuals — звідси вузький
// порт на enqueue. Свідомо НЕ тягнемо сюди весь QueuePort з api: worker ставить рівно
// один вид job, і ширший контракт був би запрошенням розмити межу api↔worker.
export interface JobProducer {
  enqueue(job: Job): Promise<void>;
  close(): Promise<void>;
}

// Детермінований jobId → BullMQ дедуплікує повторний enqueue (напр. retry прогону),
// щоб та сама картинка не малювалась (і не оплачувалась) двічі.
export function createJobProducer(connection: Redis, logger: Logger): JobProducer {
  const queue = new Queue(QUEUE_NAMES.jobs, { connection });
  return {
    async enqueue(job: Job): Promise<void> {
      await queue.add(job.kind, job, {
        jobId: job.jobId,
        removeOnComplete: true,
        removeOnFail: 1000,
      });
      logger.info({ jobId: job.jobId, kind: job.kind }, "enqueued follow-up job");
    },
    async close(): Promise<void> {
      await queue.close();
    },
  };
}
