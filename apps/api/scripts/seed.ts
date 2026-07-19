// B1 (auth end-to-end) dev-seed: робить логін demo@forteq.dev/demo1234 робочим наскрізно.
// Два кроки за §2.8.3 (лінк auth→domain по email):
//   (а) Better Auth signUpEmail → ba_user + ba_account (пароль хешується провайдером "credential").
//   (б) домен під OWNER-конектом (обходить RLS/FORCE): accounts/users/memberships/company/plan.
// users.email МУСИТЬ збігатися з ba_user.email — саме по ньому resolveByEmail лінкує сесію в домен.
// Ідемпотентно: детерміновані id + onConflictDoNothing; повторний запуск безпечний.
//
// Запуск (owner-URL у env): pnpm --filter @forteq/api seed
import { parseEnv } from "../src/config/env";
import { createAuth } from "../src/auth/better-auth";
import {
  createDb,
  accounts,
  users,
  memberships,
  companies,
  companySettings,
  contentPlans,
} from "@forteq/db";

// Демо-креденшели (МВП, seed-only sign-up — §2.8.3).
const DEMO_EMAIL = "demo@forteq.dev";
const DEMO_PASSWORD = "demo1234";
const DEMO_NAME = "Demo";

// Детерміновані доменні id (v4-подібні) → ідемпотентність по pk/unique.
const accountId = "a0000000-0000-4000-8000-000000000001";
const userId = "b0000000-0000-4000-8000-000000000001";
const companyId = "c0000000-0000-4000-8000-000000000001";
const planId = "d0000000-0000-4000-8000-000000000001";

async function main(): Promise<void> {
  const config = parseEnv(process.env);

  // OWNER-конект (forteq_owner, superuser) — обходить RLS/FORCE, тож пише accounts/users/memberships
  // БЕЗ account-контексту. Той самий конект віддаємо Better Auth (ba_-таблиці без RLS, теж ок).
  const ownerUrl = config.DATABASE_MIGRATE_URL;
  if (!ownerUrl) {
    console.error("seed: потрібен DATABASE_MIGRATE_URL (owner, обходить RLS)");
    process.exit(1);
  }

  const db = createDb(ownerUrl);
  const auth = createAuth(db, config);

  // (а) Демо-юзер через Better Auth: коректно хешує пароль у ba_account (provider "credential"),
  //     створює ba_user (+ ba_session). Це те, що робить наступний sign-in валідним.
  try {
    await auth.api.signUpEmail({
      body: { email: DEMO_EMAIL, password: DEMO_PASSWORD, name: DEMO_NAME },
    });
    console.log("seed: ba_user створено через Better Auth:", DEMO_EMAIL);
  } catch (err) {
    // Ідемпотентність: якщо юзер уже існує — Better Auth кидає; для seed це не помилка.
    console.log(
      "seed: signUpEmail пропущено (ймовірно, юзер уже існує):",
      err instanceof Error ? err.message : String(err),
    );
  }

  // (б) Домен під owner. onConflictDoNothing → повторний seed безпечний.
  await db.insert(accounts).values({ id: accountId, name: "Demo Account" }).onConflictDoNothing();

  // ЗБІГ email із ba_user.email — обов'язкова умова resolveByEmail (§2.8.3).
  await db
    .insert(users)
    .values({ id: userId, email: DEMO_EMAIL, name: DEMO_NAME })
    .onConflictDoNothing();

  // membership(owner) — bootstrap авторизації дістає з неї { accountId, role } (§2.10.3).
  await db
    .insert(memberships)
    .values({ accountId, userId, role: "owner" })
    .onConflictDoNothing();

  // Демо-компанія + settings + default content-plan (щоб UI мав що показати одразу після логіну).
  await db
    .insert(companies)
    .values({
      id: companyId,
      accountId,
      name: "Forteq Demo",
      positioning: "IT-сервісна компанія для B2B",
      stack: ["TypeScript", "Node.js", "PostgreSQL"],
      services: ["веб-розробка", "інтеграції", "DevOps"],
      audience: "CTO та tech-ліди середнього бізнесу",
    })
    .onConflictDoNothing();

  await db
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

  await db
    .insert(contentPlans)
    .values({ id: planId, accountId, companyId, name: "default" })
    .onConflictDoNothing();

  console.log("seed: домен засіяно", {
    email: DEMO_EMAIL,
    accountId,
    userId,
    companyId,
    planId,
  });

  // Форсимо чистий вихід — postgres-js пул та Better Auth тримають відкриті конекти.
  process.exit(0);
}

main().catch((err) => {
  console.error("seed failed:", err);
  process.exit(1);
});
