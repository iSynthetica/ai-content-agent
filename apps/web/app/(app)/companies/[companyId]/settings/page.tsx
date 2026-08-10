// Company-scoped налаштування (§per-company-settings): таб-хаб «Ключі API» + «Підключення». Ключі
// провайдерів і конекти соцмереж/Telegram переїхали сюди з account-рівня — тепер вони належать
// конкретній компанії. Team/члени лишаються account-рівнем (глобальний /settings).
//
// SSR: сервер тягне company-scoped ключі + підключення й передає їх initialData (без клієнтської
// waterfall). Гейти беремо з ролі сесії (той самий акаунт api обслужить через RLS). Активний таб —
// з ?tab (keys|connections), дефолт keys; OAuth-callback повертає сюди на ?tab=connections.
import { redirect } from "next/navigation";

import { apiClient } from "@/server/api-client";
import { getSession } from "@/server/auth";
import { endpoints } from "@/lib/endpoints";
import { apiKeysResponse, companyDTO, connectionsResponse, can } from "@forteq/shared";
import { ApiKeysManager } from "@/features/api-keys/ApiKeysManager";
import { ConnectionsManager } from "@/features/connections/ConnectionsManager";
import { SettingsTabs, type SettingsTabDef } from "@/features/settings/SettingsTabs";
import { getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

function normalizeTab(raw: string | string[] | undefined): "keys" | "connections" {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value === "connections" ? "connections" : "keys";
}

export default async function CompanySettingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ companyId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const t = await getT();
  const { companyId } = await params;
  const sp = await searchParams;
  const initialTab = normalizeTab(sp.tab);

  const canManageKeys = can(session.account.role, "apikey:manage");
  const canManageConnections = can(session.account.role, "connection:manage");

  // SSR-знімки company-scoped ресурсів. Ключі + підключення читає будь-який член (RLS ізолює акаунт).
  const [company, { items: keys }, connections] = await Promise.all([
    apiClient.get(endpoints.company(companyId), companyDTO),
    apiClient.get(endpoints.apiKeys(companyId), apiKeysResponse),
    apiClient.get(endpoints.connections(companyId), connectionsResponse),
  ]);

  const keysPanel = (
    <section className="flex flex-col gap-4">
      <header className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold tracking-tight">{t("Ключі API")}</h2>
        <p className="text-sm text-muted-foreground">
          {t("Свій ключ провайдера на компанію: генерація оплачується вашим ключем. Без ключа потрібного провайдера прогони цієї компанії не запускаються.")}
        </p>
      </header>
      <ApiKeysManager companyId={companyId} initialKeys={keys} canManage={canManageKeys} />
      {!canManageKeys && (
        <p className="text-sm text-muted-foreground">
          {t("Керувати ключами можуть лише власник і адміністратор акаунта.")}
        </p>
      )}
    </section>
  );

  const connectionsPanel = (
    <section className="flex flex-col gap-4">
      <header className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold tracking-tight">{t("Підключення")}</h2>
        <p className="text-sm text-muted-foreground">
          {t("Підключіть соцмережі, щоб публікувати схвалені пости, і Telegram — щоб отримувати сповіщення про готовий контент.")}
        </p>
      </header>
      <ConnectionsManager
        companyId={companyId}
        initialConnections={connections}
        canManage={canManageConnections}
      />
      {!canManageConnections && (
        <p className="text-sm text-muted-foreground">
          {t("Керувати підключеннями можуть лише власник і адміністратор акаунта.")}
        </p>
      )}
    </section>
  );

  const tabs: SettingsTabDef[] = [
    { id: "keys", label: t("Ключі API"), panel: keysPanel },
    { id: "connections", label: t("Підключення"), panel: connectionsPanel },
  ];

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t("Налаштування компанії")}</h1>
        <p className="text-muted-foreground">
          {company.name} — {t("ключі API та підключення для публікації.")}
        </p>
      </header>

      <SettingsTabs initialTab={initialTab} tabs={tabs} />
    </div>
  );
}
