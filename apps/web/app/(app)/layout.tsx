// Захищена зона (spike-3 §5, §6 AppShell). RSC-gate: немає сесії → /login. Тягне акаунти +
// компанії активного акаунта на сервері й роздає їх AppShell як initialData для switcher-ів
// (без клієнтського waterfall, §8.5). Активний акаунт: cookie activeAccountId → session.account → перший.
import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";

import { AppShell } from "@/components/layout/AppShell";
import { apiClient } from "@/server/api-client";
import { getSession } from "@/server/auth";
import { endpoints } from "@/lib/endpoints";
import { accountsResponse, companiesResponse } from "@forteq/shared";
import { ACTIVE_ACCOUNT_COOKIE } from "@/lib/auth-constants";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");

  const [{ items: accounts }, store] = await Promise.all([
    apiClient.get(endpoints.accounts(), accountsResponse),
    cookies(),
  ]);

  const cookieAccount = store.get(ACTIVE_ACCOUNT_COOKIE)?.value;
  const activeAccountId =
    (cookieAccount && accounts.some((a) => a.id === cookieAccount) ? cookieAccount : undefined) ??
    session.account.id ??
    accounts[0]?.id ??
    "";

  const { items: companies } = activeAccountId
    ? await apiClient.get(endpoints.companies(activeAccountId), companiesResponse)
    : { items: [] };

  return (
    <AppShell
      session={session}
      accounts={accounts}
      companies={companies}
      activeAccountId={activeAccountId}
    >
      {children}
    </AppShell>
  );
}
