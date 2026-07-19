import { and, eq } from "drizzle-orm";
import { accounts, memberships } from "@forteq/db";
import type { DbExecutor } from "../di/types";
import type { Account, AccountsRepo } from "./interfaces";

// Drizzle-репозиторій акаунтів (§4.2). Працює на request-scoped tx: запити ключаються на
// app.current_user_id (виставляє openScope), тож RLS accounts_member_read + memberships_read_own
// відкривають УСІ акаунти user (switcher), а не лише активний (§2.8.3).
export class DrizzleAccountsRepo implements AccountsRepo {
  constructor(private readonly tx: DbExecutor) {}

  async listByUser(userId: string): Promise<Account[]> {
    const rows = await this.tx
      .select({ id: accounts.id, name: accounts.name, role: memberships.role })
      .from(memberships)
      .innerJoin(accounts, eq(accounts.id, memberships.accountId))
      .where(eq(memberships.userId, userId));
    return rows.map((r) => ({ id: r.id, name: r.name, role: r.role }));
  }

  async isMember(userId: string, accountId: string): Promise<boolean> {
    const [row] = await this.tx
      .select({ id: memberships.id })
      .from(memberships)
      .where(and(eq(memberships.userId, userId), eq(memberships.accountId, accountId)))
      .limit(1);
    return Boolean(row);
  }
}
