// Інтеграційний тест ізоляції орендарів (ADR-0003). Найцінніший тест у кодовій базі: збій RLS
// означає не баг, а витік чужих даних, і жодна інша перевірка його не ловить — типи мовчать,
// юніт-тести працюють на фейках, а в UI чужі рядки виглядають як свої.
//
// ВИМАГАЄ ЖИВОЇ БД (`pnpm docker:up`), тому винесений в окремий скрипт `test:rls`, а не в
// `pnpm test`. Тест, який мовчки пропускається без інфраструктури, гірший за відсутній: він
// створює враження покриття там, де нічого не перевіряється.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";

const OWNER_URL =
  process.env.DATABASE_MIGRATE_URL ?? "postgres://forteq_owner:owner@localhost:5433/forteq";
const APP_URL = process.env.DATABASE_URL ?? "postgres://forteq_app:app@localhost:5433/forteq";

const ACCOUNT_A = "e2e0a000-0000-4000-8000-00000000000a";
const ACCOUNT_B = "e2e0b000-0000-4000-8000-00000000000b";

let owner: postgres.Sql;
let app: postgres.Sql;

beforeAll(async () => {
  owner = postgres(OWNER_URL, { max: 1, onnotice: () => {} });
  app = postgres(APP_URL, { max: 1, onnotice: () => {} });

  try {
    await owner`SELECT 1`;
  } catch (e) {
    throw new Error(
      `RLS-тест вимагає живої БД. Підніміть інфраструктуру: pnpm docker:up && pnpm db:migrate\n${e}`,
    );
  }

  // Дані готує OWNER — він обходить RLS, тож може створити рядки для ОБОХ акаунтів.
  await owner`DELETE FROM companies WHERE account_id IN (${ACCOUNT_A}, ${ACCOUNT_B})`;
  await owner`DELETE FROM accounts WHERE id IN (${ACCOUNT_A}, ${ACCOUNT_B})`;
  await owner`INSERT INTO accounts (id, name) VALUES (${ACCOUNT_A}, 'RLS A'), (${ACCOUNT_B}, 'RLS B')`;
  await owner`
    INSERT INTO companies (account_id, name) VALUES
      (${ACCOUNT_A}, 'Company A'),
      (${ACCOUNT_B}, 'Company B')`;
  // BYOK: ключі орендарів — секрети, ізоляція тут критичніша за все (ADR-0016). Прибираються
  // каскадом при видаленні акаунтів в afterAll (FK on delete cascade).
  await owner`
    INSERT INTO api_keys (account_id, provider, ciphertext, last4) VALUES
      (${ACCOUNT_A}, 'openai', 'ct-A', 'aaaa'),
      (${ACCOUNT_B}, 'openai', 'ct-B', 'bbbb')`;
});

afterAll(async () => {
  // Optional chaining з tagged template невалідне — прибираємо звичайною перевіркою.
  if (owner) {
    await owner`DELETE FROM companies WHERE account_id IN (${ACCOUNT_A}, ${ACCOUNT_B})`;
    await owner`DELETE FROM accounts WHERE id IN (${ACCOUNT_A}, ${ACCOUNT_B})`;
    await owner.end();
  }
  if (app) await app.end();
});

/** Виконує запит під роллю forteq_app із виставленим account-скоупом — так само, як робить рантайм. */
async function asAccount<T>(accountId: string, fn: (tx: postgres.Sql) => Promise<T>): Promise<T> {
  return app.begin(async (tx) => {
    await tx`SELECT set_config('app.current_account_id', ${accountId}, true)`;
    return fn(tx as unknown as postgres.Sql);
  }) as Promise<T>;
}

describe("RLS: ізоляція орендарів", () => {
  it("акаунт бачить ЛИШЕ свої компанії", async () => {
    const rows = await asAccount(ACCOUNT_A, (tx) => tx`SELECT name FROM companies`);
    const names = rows.map((r) => r.name);
    expect(names).toContain("Company A");
    expect(names).not.toContain("Company B");
  });

  it("прямий запит за чужим id повертає порожньо, а не рядок", async () => {
    // Найнебезпечніший сценарій: код звертається за конкретним id, отриманим ззовні. Без RLS
    // повернувся б чужий рядок, і застосунок віддав би його як свій.
    const rows = await asAccount(
      ACCOUNT_A,
      (tx) => tx`SELECT name FROM companies WHERE account_id = ${ACCOUNT_B}`,
    );
    expect(rows).toHaveLength(0);
  });

  it("запис у чужий акаунт відхиляється політикою WITH CHECK", async () => {
    await expect(
      asAccount(
        ACCOUNT_A,
        (tx) => tx`INSERT INTO companies (account_id, name) VALUES (${ACCOUNT_B}, 'Стороння')`,
      ),
    ).rejects.toThrow();
  });

  it("оновлення чужого рядка не зачіпає жодного", async () => {
    const updated = await asAccount(
      ACCOUNT_A,
      (tx) => tx`UPDATE companies SET name = 'Зламано' WHERE account_id = ${ACCOUNT_B} RETURNING id`,
    );
    expect(updated).toHaveLength(0);

    // Незалежна перевірка під owner: рядок B справді цілий.
    const [b] = await owner`SELECT name FROM companies WHERE account_id = ${ACCOUNT_B}`;
    expect(b?.name).toBe("Company B");
  });

  it("БЕЗ виставленого скоупу не видно нічого", async () => {
    // Саме тут ламався NULLIF: на пулених з'єднаннях GUC повертається порожнім рядком, і без
    // NULLIF приведення ''::uuid валило КОЖЕН запит замість того, щоб просто нічого не показати.
    const rows = await app`SELECT name FROM companies`;
    expect(rows).toHaveLength(0);
  });

  it("порожній рядок у GUC поводиться як відсутній скоуп, а не як помилка", async () => {
    const rows = await app.begin(async (tx) => {
      await tx`SELECT set_config('app.current_account_id', '', true)`;
      return tx`SELECT name FROM companies`;
    });
    expect(rows).toHaveLength(0);
  });
});

describe("RLS: ізоляція ключів api_keys (секрети орендаря)", () => {
  it("акаунт бачить ЛИШЕ свій шифротекст, не чужий", async () => {
    const rows = await asAccount(ACCOUNT_A, (tx) => tx`SELECT ciphertext FROM api_keys`);
    const cts = rows.map((r) => r.ciphertext);
    expect(cts).toContain("ct-A");
    expect(cts).not.toContain("ct-B");
  });

  it("прямий запит за чужим account_id не повертає ключа", async () => {
    const rows = await asAccount(
      ACCOUNT_A,
      (tx) => tx`SELECT ciphertext FROM api_keys WHERE account_id = ${ACCOUNT_B}`,
    );
    expect(rows).toHaveLength(0);
  });

  it("запис ключа у чужий акаунт відхиляється WITH CHECK", async () => {
    await expect(
      asAccount(
        ACCOUNT_A,
        (tx) =>
          tx`INSERT INTO api_keys (account_id, provider, ciphertext, last4) VALUES (${ACCOUNT_B}, 'anthropic', 'ct-x', 'xxxx')`,
      ),
    ).rejects.toThrow();
  });

  it("БЕЗ виставленого скоупу ключів не видно", async () => {
    const rows = await app`SELECT ciphertext FROM api_keys`;
    expect(rows).toHaveLength(0);
  });
});
