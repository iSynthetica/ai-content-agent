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

  // BYOK (§ADR-0016): master-ключ для шифрування ключів провайдерів орендаря (AES-256-GCM).
  // hex-64 або base64, рівно 32 байти — валідність перевіряє parseMasterKey у composition (fail-fast).
  BYOK_ENCRYPTION_KEY: z.string().min(32),

  // CORS origin web-застосунку (§2.8.4) + сховище картинок (§4.3) — шви, з дефолтами.
  CORS_ORIGIN: z.string().url().default("http://localhost:3000"),
  IMAGE_STORAGE_DIR: z.string().default("/data/images"),
  PUBLIC_BASE_URL: z.string().url().optional(),

  // Публікація в соцмережі (§publishing, master-plan §2 п.5).
  // MEDIA_SIGNING_SECRET — спільний секрет HMAC для публічних медіа-токенів (worker підписує URL
  // зображення, який тягне СЕРВЕР провайдера без cookie; api-роут /media/public/:token перевіряє).
  // Той самий секрет підписує короткоживучий OAuth-state-cookie (CSRF + PKCE-verifier), якщо
  // окремий OAUTH_STATE_SECRET не заданий.
  MEDIA_SIGNING_SECRET: z.string().min(16),
  // Абсолютна база публічних медіа-URL (worker мінтить сюди; api тримає для симетрії конфіга).
  PUBLIC_MEDIA_BASE_URL: z.string().url().default("https://saas.forteqsolution.com/api"),
  // Окремий секрет для підпису OAuth-state-cookie (шов). Не заданий → реюз MEDIA_SIGNING_SECRET.
  OAUTH_STATE_SECRET: z.string().min(16).optional(),

  // ── LinkedIn OAuth + Posts API (§publishing/01-linkedin §7) ──
  // Усі креди optional: без них провайдер «не сконфігурований» і кнопка Connect вимкнена
  // (foundation §3.1, isConfigured → false). client_secret — тільки з env, у логи ніколи.
  LINKEDIN_CLIENT_ID: z.string().optional(),
  LINKEDIN_CLIENT_SECRET: z.string().optional(),
  // Абсолютний HTTPS redirect, ЗБІГ із зареєстрованим у LinkedIn-застосунку (§2.1). Читається у
  // linkedinOAuthConfig — тому з дефолтом, а не хардкодом у конфізі провайдера.
  LINKEDIN_REDIRECT_URI: z
    .string()
    .url()
    .default("https://saas.forteqsolution.com/api/connections/linkedin/callback"),
  // Версія Posts/Images API у форматі YYYYMM; пінимо й періодично оновлюємо (версії сансетяться ~15міс).
  LINKEDIN_API_VERSION: z.string().regex(/^\d{6}$/).default("202606"),

  // ── X/Twitter OAuth 2.0 + PKCE (§publishing/02-twitter §8) ──
  // Обидві креди optional: без них провайдер «не сконфігурований» і кнопка Connect вимкнена
  // (foundation §3.1, isConfigured → false). client_secret — тільки з env, у логи ніколи.
  X_CLIENT_ID: z.string().optional(),
  X_CLIENT_SECRET: z.string().optional(),
  // Абсолютний HTTPS redirect, ТОЧНИЙ збіг із зареєстрованим у X-застосунку (§2.1). Читається у
  // twitterOAuthConfig — тому з дефолтом, а не хардкодом у конфізі провайдера.
  X_REDIRECT_URI: z
    .string()
    .url()
    .default("https://saas.forteqsolution.com/api/connections/twitter/callback"),

  // ── Instagram OAuth (Facebook Login for Business) (§publishing/03-instagram §9) ──
  // Обидві креди optional: без них провайдер «не сконфігурований» і кнопка Connect вимкнена
  // (foundation §3.1, isConfigured → false). client_secret — тільки з env, у логи ніколи.
  // = Meta App ID / App Secret.
  IG_CLIENT_ID: z.string().optional(),
  IG_CLIENT_SECRET: z.string().optional(),
  // Абсолютний HTTPS redirect, ТОЧНИЙ збіг із зареєстрованим у Meta-застосунку (§10). Читається у
  // instagramOAuthConfig — тому з дефолтом, а не хардкодом у конфізі провайдера.
  IG_REDIRECT_URI: z
    .string()
    .url()
    .default("https://saas.forteqsolution.com/api/connections/instagram/callback"),
  // Версія Graph API (з префіксом `v`) — Meta ротує ~щоквартально (§11); пінимо й bump'аємо тут.
  // Дзеркалить apps/worker IG_GRAPH_VERSION (той самий рядок будує URL у публікаторі).
  IG_GRAPH_VERSION: z.string().regex(/^v\d+\.\d+$/).default("v21.0"),

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
