import { z } from "zod";

// Валідація process.env worker'а. Падаємо на СТАРТІ, якщо конфіг невалідний (spike-1 §6).
// Секрети (OPENAI/ANTHROPIC/TAVILY) читаються ТІЛЬКИ тут (composition root) і не потрапляють
// у пайплайн як env — вони замикаються у ModelFactoryBuilder/адаптерах (§6, §11).
export const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  // Черга (BullMQ / Redis)
  REDIS_URL: z.string().url(),

  // БД — RLS-конект під роллю forteq_app (spike-2). Той самий DATABASE_URL і для checkpointer'а.
  DATABASE_URL: z.string().url(),

  // LLM-секрети. ОПЦІЙНІ: якщо ключів нема (або FAKE_MODELS=1) — composition інжектить
  // ФЕЙКОВИЙ ModelFactory (детерміновані відповіді), тож end-to-end плумбінг проходить БЕЗ реальних
  // LLM-викликів/ключів (spike-1 §14, барʼєр B2). Реальний прогін вимагає OPENAI/ANTHROPIC ключа.
  OPENAI_API_KEY: z.string().min(1).optional(),
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  TAVILY_API_KEY: z.string().min(1).optional(),

  // Прапорець фейкових моделей для smoke/CI: "1" → детермінований ModelFactory без мережі.
  // z.string (не enum), щоб несподіване значення не валило старт worker'а — активний лише рівно "1".
  FAKE_MODELS: z.string().optional(),

  // Штучна затримка на КОЖЕН fake-виклик моделі (мс). Робить per-node прогрес видимим наживо на демо
  // (кожна нода «висить» помітний час). Стосується ЛИШЕ фейкових моделей; реальні LLM не чіпаємо.
  FAKE_STEP_DELAY_MS: z.coerce.number().int().nonnegative().default(700),

  // Прапорець setup() checkpointer'а на старті worker'а. Рантайм-worker (forteq_app, non-superuser
  // без CREATE — §2.10.1) НЕ виставляє його → setup пропускається. Checkpoint-таблиці провізіонить
  // окремий owner-крок `setup:checkpointer` (DATABASE_MIGRATE_URL). Активний лише рівно "1".
  CHECKPOINTER_SETUP: z.string().optional(),

  // Сховище зображень (МВП — локальний том; продукт — MinIO/S3)
  IMAGE_DIR: z.string().default("./output/images"),

  // Спостережуваність — LangSmith автоінструментує пайплайн через env (§11)
  LANGSMITH_API_KEY: z.string().optional(),
  LANGSMITH_TRACING: z.enum(["true", "false"]).optional(),
  LANGSMITH_PROJECT: z.string().optional(),

  // Runtime worker'а
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),
  WORKER_CONCURRENCY: z.coerce.number().int().positive().default(5),
});

export type Env = z.infer<typeof envSchema>;

/** Парсить і валідує env; кидає з людиночитним переліком проблем, якщо конфіг невалідний. */
export function parseEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    throw new Error(`Невалідні змінні середовища worker'а:\n${issues}`);
  }
  return parsed.data;
}
