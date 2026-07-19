import { z } from "zod";

// Джерело істини для ENV api (spike-2 §5.1). Парситься РАЗ у main.ts; результат кладеться
// у config і йде в composition root. Ніхто не читає process.env глибше (без прихованих залежностей).
// Секрети — тільки з env, у логи ніколи (redact-список у composition, NFR-4.1).
export const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  API_PORT: z.coerce.number().int().positive().default(4000),

  // Postgres. DATABASE_URL — роль forteq_app (non-superuser під RLS, §2.10.1).
  // MIGRATE (owner) і SWEEPER (BYPASSRLS) — не рантайм api; тримаємо як шов (optional).
  DATABASE_URL: z.string().url(),
  DATABASE_MIGRATE_URL: z.string().url().optional(),
  DATABASE_SWEEPER_URL: z.string().url().optional(),

  // Черга (BullMQ) — тверда межа: api лише enqueue, граф не ганяє (§2.7).
  REDIS_URL: z.string().url(),

  // Auth (§2.6). Мінімальна вимога до довжини секрету.
  AUTH_SECRET: z.string().min(16),

  // CORS origin web-застосунку (§2.8.4) + сховище картинок (§4.3) — шви, з дефолтами.
  CORS_ORIGIN: z.string().url().default("http://localhost:3000"),
  IMAGE_STORAGE_DIR: z.string().default("/data/images"),
  PUBLIC_BASE_URL: z.string().url().optional(),

  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

export type Env = z.infer<typeof envSchema>;

// AppConfig — те, що бачить застосунок після валідації (аліас Env для читабельності DI).
export type AppConfig = Env;

// parseEnv — валідує сирий process.env; на помилці кидає з переліком усіх проблем (fail-fast).
export function parseEnv(raw: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    throw new Error(`Невалідний ENV:\n${issues}`);
  }
  return parsed.data;
}
