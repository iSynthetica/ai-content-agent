// B2-фікс (checkpointer-as-owner): checkpoint-таблиці LangGraph створюються DDL-ом
// (CREATE TABLE ...), тож їх мусить провізіонити OWNER, а НЕ рантайм-worker (той конектиться
// під forteq_app, non-superuser без CREATE — §2.10.1). Тому setup() винесено в окремий крок:
//   1) PostgresSaver.fromConnString(DATABASE_MIGRATE_URL || DATABASE_URL).setup()  ← owner
//   2) GRANT SELECT,INSERT,UPDATE,DELETE на 4 checkpoint-таблиці для forteq_app
// Checkpoint-таблиці НЕ під RLS (не тенант-таблиці) — рантайм-worker пише в них стан графа
// напряму. Запуск (owner-URL у env): pnpm --filter @forteq/worker setup:checkpointer
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import postgres from "postgres";

// Owner-конект для DDL: спершу MIGRATE (forteq_owner), fallback — DATABASE_URL (для середовищ,
// де owner і рантайм збігаються). Рантайм-worker (forteq_app) сюди НЕ передаємо — у нього нема CREATE.
const OWNER_URL = process.env.DATABASE_MIGRATE_URL ?? process.env.DATABASE_URL;

// Таблиці, що створює PostgresSaver.setup() (LangGraph checkpoint-postgres).
const CHECKPOINTER_TABLES = [
  "checkpoints",
  "checkpoint_writes",
  "checkpoint_blobs",
  "checkpoint_migrations",
] as const;

async function main(): Promise<void> {
  if (!OWNER_URL) {
    console.error(
      "setup:checkpointer: потрібен DATABASE_MIGRATE_URL (owner) або DATABASE_URL",
    );
    process.exit(1);
  }

  // 1) DDL під owner: створює checkpoint-таблиці, якщо їх ще нема (ідемпотентно).
  const saver = PostgresSaver.fromConnString(OWNER_URL);
  await saver.setup();
  console.log("setup:checkpointer: PostgresSaver.setup() done (owner)");

  // 2) GRANT для forteq_app (рантайм-worker) — окремий postgres-клієнт під тим самим owner-URL.
  //    Імена таблиць — з hardcoded-константи (не user input), тож sql.unsafe безпечний.
  const sql = postgres(OWNER_URL, { max: 1 });
  try {
    await sql.unsafe(
      `GRANT SELECT, INSERT, UPDATE, DELETE ON ${CHECKPOINTER_TABLES.join(", ")} TO forteq_app`,
    );
    console.log(
      "setup:checkpointer: granted CRUD to forteq_app on",
      CHECKPOINTER_TABLES.join(", "),
    );
  } finally {
    await sql.end();
  }

  // PostgresSaver-пул закриється сам на exit; форсимо чистий вихід.
  process.exit(0);
}

main().catch((err) => {
  console.error("setup:checkpointer failed:", err);
  process.exit(1);
});
