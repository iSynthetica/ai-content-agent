import { Queue } from "bullmq";
import IORedis, { type Redis } from "ioredis";
import { randomUUID } from "node:crypto";
import type { Logger } from "pino";
import {
  generationStartJob,
  generationResumeJob,
  onboardingBootstrapJob,
  suggestTopicsJob,
  suggestRunTopicsJob,
} from "@forteq/shared";
import type {
  QueuePort,
  EnqueueRunPayload,
  EnqueueBootstrapPayload,
  EnqueueSuggestTopicsPayload,
  EnqueueSuggestRunTopicsPayload,
} from "../ports/queue.port";

// Назва черги — ЄДИНЕ джерело правди, узгоджене з consumer'ом (apps/worker QUEUE_NAMES.jobs).
// Усі типи job їдуть однією чергою; розрізнення — за дискримінантом job.kind у worker/router.
const QUEUE_NAME = "forteq-jobs";

// Опції job: детермінований jobId дає BullMQ-dedup (ідемпотентність повторного enqueue, §2.7.1).
const JOB_OPTS = { removeOnComplete: true, removeOnFail: 1000 } as const;

/** Реалізація QueuePort на BullMQ (spike-2 §4.3, задача API-6). Продюсер: api лише enqueue. */
export class BullMqQueueAdapter implements QueuePort {
  private readonly connection: Redis;
  private readonly queue: Queue;

  constructor(redisUrl: string, private readonly logger: Logger) {
    // maxRetriesPerRequest: null — вимога BullMQ до конекту (сумісно з worker'ом).
    this.connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });
    this.queue = new Queue(QUEUE_NAME, { connection: this.connection });
  }

  async enqueueRun(p: EnqueueRunPayload): Promise<{ jobId: string }> {
    if (p.mode === "resume") {
      const nonce = p.nonce ?? randomUUID();
      const jobId = `run-${p.runId}-resume-${nonce}`;
      const data = generationResumeJob.parse({
        kind: "generation.resume",
        jobId,
        accountId: p.accountId,
        runId: p.runId,
        threadId: p.threadId,
        decision: { action: p.resume?.action ?? "reject", feedback: p.resume?.feedback },
      });
      await this.queue.add(data.kind, data, { jobId, ...JOB_OPTS });
      this.logger.info({ jobId, kind: data.kind }, "enqueued resume job");
      return { jobId };
    }

    const jobId = `run-${p.runId}-generate`;
    const data = generationStartJob.parse({
      kind: "generation.start",
      jobId,
      accountId: p.accountId,
      runId: p.runId,
      companyId: p.companyId,
      planEntryIds: p.planEntryIds,
    });
    await this.queue.add(data.kind, data, { jobId, ...JOB_OPTS });
    this.logger.info({ jobId, kind: data.kind }, "enqueued generate job");
    return { jobId };
  }

  async enqueueBootstrap(p: EnqueueBootstrapPayload): Promise<{ jobId: string }> {
    const jobId = `bootstrap-${p.companyId}`;
    const data = onboardingBootstrapJob.parse({
      kind: "onboarding.bootstrap",
      jobId,
      accountId: p.accountId,
      companyId: p.companyId,
    });
    await this.queue.add(data.kind, data, { jobId, ...JOB_OPTS });
    this.logger.info({ jobId, kind: data.kind }, "enqueued bootstrap job");
    return { jobId };
  }

  async enqueueSuggestTopics(p: EnqueueSuggestTopicsPayload): Promise<{ jobId: string }> {
    const jobId = `suggest-${p.contentPlanId}-${randomUUID()}`;
    const data = suggestTopicsJob.parse({
      kind: "planner.suggest_topics",
      jobId,
      accountId: p.accountId,
      companyId: p.companyId,
      contentPlanId: p.contentPlanId,
      planEntryIds: p.planEntryIds,
    });
    await this.queue.add(data.kind, data, { jobId, ...JOB_OPTS });
    this.logger.info({ jobId, kind: data.kind }, "enqueued suggest-topics job");
    return { jobId };
  }

  async enqueueSuggestRunTopics(p: EnqueueSuggestRunTopicsPayload): Promise<{ jobId: string }> {
    // Один draft — рівно одна спроба підбору (без nonce): retry enqueue того ж draftId дедуплікує.
    const jobId = `runtopics-${p.draftId}`;
    const data = suggestRunTopicsJob.parse({
      kind: "runtopics.suggest",
      jobId,
      accountId: p.accountId,
      companyId: p.companyId,
      draftId: p.draftId,
    });
    await this.queue.add(data.kind, data, { jobId, ...JOB_OPTS });
    this.logger.info({ jobId, kind: data.kind }, "enqueued runtopics.suggest job");
    return { jobId };
  }

  /** Плавне завершення — закриваємо чергу і конект (викликається з main.ts shutdown). */
  async close(): Promise<void> {
    await this.queue.close();
    await this.connection.quit();
  }
}
