// Індекс `/` (spike-3 §5): RSC-редірект. Є компанії → на дефолтну (`/companies/:id`);
// інакше → `/onboarding`. Немає сесії → `/login` (middleware вже гейтить, це підстраховка).
// Сторінка нічого не рендерить — лише редіректить.
import { redirect } from "next/navigation";
import { cookies } from "next/headers";

import { apiClient } from "@/server/api-client";
import { getSession } from "@/server/auth";
import { endpoints } from "@/lib/endpoints";
import { accountsResponse, companiesResponse } from "@forteq/shared";
import { ACTIVE_ACCOUNT_COOKIE } from "@/lib/auth-constants";

export const dynamic = "force-dynamic";

export default async function RootPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const store = await cookies();
  const cookieAccount = store.get(ACTIVE_ACCOUNT_COOKIE)?.value;
  const { items: accounts } = await apiClient.get(endpoints.accounts(), accountsResponse);
  const activeAccountId =
    (cookieAccount && accounts.some((a) => a.id === cookieAccount) ? cookieAccount : undefined) ??
    session.account.id ??
    accounts[0]?.id;

  if (!activeAccountId) redirect("/onboarding");

  const { items: companies } = await apiClient.get(
    endpoints.companies(activeAccountId),
    companiesResponse,
  );
  if (companies.length === 0) redirect("/onboarding");

  redirect(`/companies/${companies[0].id}`);
}
