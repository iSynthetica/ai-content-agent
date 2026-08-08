import { and, asc, count, eq } from "drizzle-orm";
import { memberships, users } from "@forteq/db";
import type { DbExecutor } from "../di/types";
import type { MemberRow, MembersRepo } from "./interfaces";

// Керування членами акаунта (§RBAC member-mgmt F2). memberships ізольована RLS за account_id
// (політика memberships_tenant), тож під openScope усі запити бачать/пишуть лише поточний акаунт.
// users — БЕЗ RLS (глобальна), тому пошук за email працює для провіженінгу нового інвайта.
export class DrizzleMembersRepo implements MembersRepo {
  constructor(private readonly tx: DbExecutor) {}

  async listByAccount(accountId: string): Promise<MemberRow[]> {
    const rows = await this.tx
      .select({
        userId: users.id,
        email: users.email,
        name: users.name,
        role: memberships.role,
        createdAt: users.createdAt,
      })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(eq(memberships.accountId, accountId))
      .orderBy(asc(users.createdAt));
    return rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }));
  }

  async findUserByEmail(email: string): Promise<{ userId: string; name: string | null } | null> {
    const [row] = await this.tx
      .select({ userId: users.id, name: users.name })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    return row ?? null;
  }

  async insertUser(email: string, name: string | null): Promise<{ userId: string; createdAt: string }> {
    const [row] = await this.tx
      .insert(users)
      .values({ email, name })
      .returning({ userId: users.id, createdAt: users.createdAt });
    return { userId: row!.userId, createdAt: row!.createdAt.toISOString() };
  }

  async insertMembership(accountId: string, userId: string, role: string): Promise<void> {
    await this.tx.insert(memberships).values({ accountId, userId, role: role as never });
  }

  async updateRole(accountId: string, userId: string, role: string): Promise<boolean> {
    const rows = await this.tx
      .update(memberships)
      .set({ role: role as never })
      .where(and(eq(memberships.accountId, accountId), eq(memberships.userId, userId)))
      .returning({ id: memberships.id });
    return rows.length > 0;
  }

  async deleteMembership(accountId: string, userId: string): Promise<boolean> {
    const rows = await this.tx
      .delete(memberships)
      .where(and(eq(memberships.accountId, accountId), eq(memberships.userId, userId)))
      .returning({ id: memberships.id });
    return rows.length > 0;
  }

  async countOwners(accountId: string): Promise<number> {
    const [row] = await this.tx
      .select({ n: count() })
      .from(memberships)
      .where(and(eq(memberships.accountId, accountId), eq(memberships.role, "owner")));
    return Number(row?.n ?? 0);
  }

  async memberRow(accountId: string, userId: string): Promise<MemberRow | null> {
    const [row] = await this.tx
      .select({
        userId: users.id,
        email: users.email,
        name: users.name,
        role: memberships.role,
        createdAt: users.createdAt,
      })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(and(eq(memberships.accountId, accountId), eq(memberships.userId, userId)))
      .limit(1);
    return row ? { ...row, createdAt: row.createdAt.toISOString() } : null;
  }
}
