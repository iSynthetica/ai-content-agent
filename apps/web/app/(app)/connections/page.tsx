// §publishing: дашборд підключень (соцмережі OAuth + Telegram-нотифікації). Connection'и
// account-scoped: api резолвить акаунт із сесії + RLS, тож гейт керування беремо з ролі сесії
// (той самий підхід, що й settings/members). GET /connections доступний будь-якому члену (RLS
// ізолює), тож SSR-знімок тягнемо завжди — без нього була б клієнтська waterfall.
import { redirect } from "next/navigation";

import { apiClient } from "@/server/api-client";
import { getSession } from "@/server/auth";
import { endpoints } from "@/lib/endpoints";
import { connectionsResponse, can } from "@forteq/shared";
import { ConnectionsManager } from "@/features/connections/ConnectionsManager";
import { getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function ConnectionsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const t = await getT();
  const connections = await apiClient.get(endpoints.connections(), connectionsResponse);
  const canManage = can(session.account.role, "connection:manage");

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t("Підключення")}</h1>
        <p className="text-muted-foreground">
          {t("Підключіть соцмережі, щоб публікувати схвалені пости, і Telegram — щоб отримувати сповіщення про готовий контент.")}
        </p>
      </header>

      <ConnectionsManager initialConnections={connections} canManage={canManage} />

      {!canManage && (
        <p className="text-sm text-muted-foreground">
          {t("Керувати підключеннями можуть лише власник і адміністратор акаунта.")}
        </p>
      )}
    </div>
  );
}
