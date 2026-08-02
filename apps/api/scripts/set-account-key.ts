// BYOK ops-скрипт: записати/ротувати ключ провайдера для акаунта (§ADR-0016). Використання:
//   демо-перехід — записати платформенний OpenAI-ключ як tenant-ключ демо-акаунта, щоб вітрина
//   працювала нашим коштом свідомо; або будь-який адмін-запис ключа без браузера.
//
// Значення ключа береться з env KEY_VALUE (НЕ з argv — інакше воно світиться у `ps`/історії).
// Запис іде під OWNER-конектом (forteq_owner — superuser, обходить RLS), тож account-контекст не
// потрібен; шифрування — тим самим master-ключем, що й api (BYOK_ENCRYPTION_KEY).
//
// Приклади:
//   KEY_VALUE="$OPENAI_API_KEY" pnpm --filter @forteq/api set-key -- --email demo@forteq.dev --provider openai --label platform
//   KEY_VALUE="sk-ant-…"        pnpm --filter @forteq/api set-key -- --account <uuid> --provider anthropic
import { and, eq } from "drizzle-orm";
import { parseEnv } from "../src/config/env";
import {
  createDb,
  apiKeys,
  users,
  memberships,
  encryptSecret,
  parseMasterKey,
} from "@forteq/db";

const PROVIDERS = ["openai", "anthropic", "gemini"] as const;
type Provider = (typeof PROVIDERS)[number];

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main(): Promise<void> {
  const config = parseEnv(process.env);
  const ownerUrl = config.DATABASE_MIGRATE_URL;
  if (!ownerUrl) {
    console.error("set-key: потрібен DATABASE_MIGRATE_URL (owner-конект, обходить RLS)");
    process.exit(1);
  }

  const provider = arg("provider") as Provider | undefined;
  if (!provider || !PROVIDERS.includes(provider)) {
    console.error(`set-key: --provider мусить бути одним з ${PROVIDERS.join(" | ")}`);
    process.exit(1);
  }

  const keyValue = process.env.KEY_VALUE?.trim();
  if (!keyValue || keyValue.length < 16) {
    console.error("set-key: задайте ключ через env KEY_VALUE (не argv), довжиною ≥16");
    process.exit(1);
  }

  const masterKey = parseMasterKey(config.BYOK_ENCRYPTION_KEY);
  const db = createDb(ownerUrl);

  // Акаунт: явний --account або резолв за --email (перша membership користувача, як у сесії).
  let accountId = arg("account");
  const email = arg("email");
  if (!accountId && email) {
    const [user] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
    if (!user) {
      console.error(`set-key: користувача ${email} не знайдено`);
      process.exit(1);
    }
    const [m] = await db
      .select({ accountId: memberships.accountId })
      .from(memberships)
      .where(eq(memberships.userId, user.id))
      .limit(1);
    if (!m) {
      console.error(`set-key: у ${email} немає membership`);
      process.exit(1);
    }
    accountId = m.accountId;
  }
  if (!accountId) {
    console.error("set-key: задайте --account <uuid> або --email <userEmail>");
    process.exit(1);
  }

  const enc = encryptSecret(keyValue, masterKey);
  const label = arg("label") ?? null;

  await db
    .insert(apiKeys)
    .values({ accountId, provider, ciphertext: enc.ciphertext, last4: enc.last4, label })
    .onConflictDoUpdate({
      target: [apiKeys.accountId, apiKeys.provider],
      set: { ciphertext: enc.ciphertext, last4: enc.last4, label, updatedAt: new Date() },
    });

  // Незалежне читання під owner — підтвердити, що рядок ліг (маскований вивід, ключ не друкуємо).
  const [row] = await db
    .select({ last4: apiKeys.last4 })
    .from(apiKeys)
    .where(and(eq(apiKeys.accountId, accountId), eq(apiKeys.provider, provider)))
    .limit(1);

  console.log(`set-key: ${provider} для акаунта ${accountId} збережено (····${row?.last4})`);
  process.exit(0);
}

main().catch((e) => {
  console.error("set-key: помилка", e);
  process.exit(1);
});
