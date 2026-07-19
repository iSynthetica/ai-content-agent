import { sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

export interface TenantContext {
  accountId: string;
  userId: string;
  role: string;
}

/**
 * Виконує `fn` у транзакції з виставленими RLS-GUC (SET LOCAL через set_config(..., true)).
 * УСІ репозиторії мусять працювати через переданий `tx` — це request/job-scoped UnitOfWork.
 * RLS-політики звіряють `account_id = current_setting('app.current_account_id')`.
 */
export async function withAccountContext<TSchema extends Record<string, unknown>, T>(
  db: PostgresJsDatabase<TSchema>,
  ctx: TenantContext,
  fn: (tx: PostgresJsDatabase<TSchema>) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.current_account_id', ${ctx.accountId}, true)`);
    await tx.execute(sql`select set_config('app.current_user_id', ${ctx.userId}, true)`);
    await tx.execute(sql`select set_config('app.current_role', ${ctx.role}, true)`);
    return fn(tx);
  });
}
