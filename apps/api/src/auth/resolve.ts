import type { IncomingHttpHeaders } from "node:http";
import { eq, sql } from "drizzle-orm";
import { fromNodeHeaders } from "better-auth/node";
import { accounts, memberships, users, type DB } from "@forteq/db";
import type { Auth } from "./better-auth";

// Резолв ланцюга: сесія → ba_user.email → domain users (БЕЗ RLS) → bootstrap-txn лише з
// app.current_user_id → memberships (видно завдяки memberships_read_own) → { accountId, role }.
// Chicken-and-egg знято (§2.8.3, §2.10.3): жодне читання не потребує контексту, якого ще нема.
export interface ResolvedAuth {
  userId: string; // ДОМЕННИЙ users.id, ніколи ba_user.id
  accountId: string;
  role: string;
  email: string;
  name: string | null;
  accountName: string;
}

// Резолв за активною сесією (для auth-middleware і GET /v1/auth/session).
export async function resolveSession(
  auth: Auth,
  db: DB,
  headers: IncomingHttpHeaders,
): Promise<ResolvedAuth | null> {
  const session = await auth.api.getSession({ headers: fromNodeHeaders(headers) });
  const email = session?.user?.email;
  if (!email) return null;
  return resolveByEmail(db, email);
}

// Резолв за email (для POST /v1/auth/sign-in — одразу після входу cookie ще в response,
// у request його нема, тож будуємо сесію-відповідь напряму з email).
export async function resolveByEmail(db: DB, email: string): Promise<ResolvedAuth | null> {
  const [domainUser] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!domainUser) return null;

  const membership = await resolvePrimaryMembership(db, domainUser.id);
  if (!membership) return null;

  return {
    userId: domainUser.id,
    accountId: membership.accountId,
    role: membership.role,
    email: domainUser.email,
    name: domainUser.name,
    accountName: membership.accountName,
  };
}

// Короткий bootstrap-txn під forteq_app лише з SET LOCAL app.current_user_id (§2.10.3).
// memberships_read_own відкриває власні рядки; accounts_member_read — назву акаунта.
async function resolvePrimaryMembership(
  db: DB,
  userId: string,
): Promise<{ accountId: string; role: string; accountName: string } | null> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.current_user_id', ${userId}, true)`);
    const [row] = await tx
      .select({
        accountId: memberships.accountId,
        role: memberships.role,
        accountName: accounts.name,
      })
      .from(memberships)
      .innerJoin(accounts, eq(accounts.id, memberships.accountId))
      .where(eq(memberships.userId, userId))
      .limit(1);
    return row ?? null;
  });
}
