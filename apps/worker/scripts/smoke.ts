// Smoke (барʼєр B2): сідить мінімальні дані й enqueue-ить generation.start у чергу, щоб ВРУЧНУ
// перевірити наскрізний плумбінг worker→pipeline→checkpointer→БД БЕЗ реальних LLM (FAKE_MODELS=1).
//
// Передумови (піднімає батько): Postgres із застосованими міграціями (@forteq/db) + Redis.
// Запуск (двома терміналами):
//   1) worker:  FAKE_MODELS=1 DATABASE_URL=... REDIS_URL=... pnpm --filter @forteq/worker dev
//   2) smoke:   DATABASE_URL=... REDIS_URL=... pnpm --filter @forteq/worker smoke
// Очікування: у worker-лозі job піде до humanReviewGate → generation_runs.status='needs_review',
// content_items заповнені (approved), costCents > 0.
import { randomUUID } from "node:crypto";
import { Queue } from "bullmq";
import IORedis from "ioredis";
import {
  createDb,
  withAccountContext,
  accounts,
  companies,
  companySettings,
  contentPlans,
  generationRuns,
} from "@forteq/db";
import { QUEUE_NAMES } from "../src/queue.js";

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("smoke: потрібен DATABASE_URL (postgres із застосованими міграціями)");
  process.exit(1);
}

// Детерміновані id → повторний запуск seed ідемпотентний (onConflictDoNothing по pk).
const accountId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const companyId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const planId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000000";
const runId = randomUUID(); // свіжий прогін щоразу
const jobId = `smoke-${runId}`;

async function seed(db: ReturnType<typeof createDb>): Promise<void> {
  // accounts — не тенант-таблиця (нема account_id). Якщо RLS блокує — засідь акаунт вручну.
  await db.insert(accounts).values({ id: accountId, name: "Smoke Account" }).onConflictDoNothing();

  await withAccountContext(db, { accountId, userId: SYSTEM_USER_ID, role: "owner" }, async (tx) => {
    await tx
      .insert(companies)
      .values({
        id: companyId,
        accountId,
        name: "Forteq",
        positioning: "IT-сервісна компанія для B2B",
        stack: ["TypeScript", "Node.js", "PostgreSQL"],
        services: ["веб-розробка", "інтеграції", "DevOps"],
        audience: "CTO та tech-ліди середнього бізнесу",
      })
      .onConflictDoNothing();

    await tx
      .insert(companySettings)
      .values({
        companyId,
        accountId,
        toneOfVoice: "професійний, без води",
        visualStyle: "чистий, сучасний, синій акцент",
        language: "uk",
        provider: "openai",
      })
      .onConflictDoNothing();

    await tx
      .insert(contentPlans)
      .values({
        id: planId,
        accountId,
        companyId,
        name: "default",
        channelCounts: { linkedin: 1, instagram: 1 },
      })
      .onConflictDoNothing();

    // Прогін у статусі queued — саме його підхопить worker за runId.
    await tx.insert(generationRuns).values({ id: runId, accountId, companyId, status: "queued" });
  });
}

async function main(): Promise<void> {
  const db = createDb(DATABASE_URL as string);
  await seed(db);
  console.log("smoke: seeded", { accountId, companyId, runId });

  const connection = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });
  const queue = new Queue(QUEUE_NAMES.jobs, { connection });
  await queue.add(
    "generation.start",
    { kind: "generation.start", jobId, accountId, runId, companyId },
    { jobId },
  );
  console.log("smoke: enqueued generation.start", { jobId, runId });

  await queue.close();
  await connection.quit();
  // db-конект (postgres-js) закриється сам на exit.
  process.exit(0);
}

main().catch((err) => {
  console.error("smoke failed:", err);
  process.exit(1);
});
