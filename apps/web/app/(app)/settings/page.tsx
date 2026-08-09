// Консолідована сторінка загальних (account-scoped) налаштувань (§settings-hub). Зводить три
// колишні окремі сторінки — «Ключі API» (/settings), «Команда» (/members), «Підключення»
// (/connections) — в один хаб із підрозділами-табами. Компанійні налаштування (Бренд/Розклад)
// сюди НЕ входять: вони per-company і живуть під /companies/[id].
//
// SSR: сервер тягне дані, що потрібні кожному менеджеру (як робили окремі сторінки), і передає їх
// initialData — без клієнтської waterfall. Гейти беремо з ролі сесії (той самий акаунт api й обслужить
// через RLS), симетрично до колишніх сторінок. Активний таб — з ?tab (keys|team|connections), дефолт
// keys, щоб підрозділи були лінкабельні (напр. OAuth-повернення на ?tab=connections).
import { redirect } from "next/navigation";

import { apiClient } from "@/server/api-client";
import { getSession } from "@/server/auth";
import { endpoints } from "@/lib/endpoints";
import {
  apiKeysResponse,
  membersResponse,
  connectionsResponse,
  can,
} from "@forteq/shared";
import { ApiKeysManager } from "@/features/api-keys/ApiKeysManager";
import { MembersManager } from "@/features/members/MembersManager";
import { ConnectionsManager } from "@/features/connections/ConnectionsManager";
import { SettingsTabs, type SettingsTab } from "@/features/settings/SettingsTabs";
import { getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

function normalizeTab(raw: string | string[] | undefined): SettingsTab {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value === "team" || value === "connections" ? value : "keys";
}

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const t = await getT();
  const sp = await searchParams;
  const initialTab = normalizeTab(sp.tab);

  // Гейти на кожен підрозділ (менеджери самі ховають недоступні дії — не-менеджер бачить read-only).
  const canManageKeys = can(session.account.role, "apikey:manage");
  const canManageTeam = can(session.account.role, "member:manage");
  const canManageConnections = can(session.account.role, "connection:manage");

  // SSR-знімки. GET /members гейтиться member:manage (не-менеджеру дав би 403), тож тягнемо лише під
  // canManageTeam — як робила колишня сторінка /members. Ключі й підключення доступні будь-якому члену.
  const [{ items: keys }, connections, members] = await Promise.all([
    apiClient.get(endpoints.apiKeys(), apiKeysResponse),
    apiClient.get(endpoints.connections(), connectionsResponse),
    canManageTeam
      ? apiClient
          .get(endpoints.members(session.account.id), membersResponse)
          .then((r) => r.items)
      : Promise.resolve([]),
  ]);

  const keysPanel = (
    <section className="flex flex-col gap-4">
      <header className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold tracking-tight">{t("Ключі API")}</h2>
        <p className="text-sm text-muted-foreground">
          {t("Свій ключ провайдера на акаунт: генерація оплачується вашим ключем. Без ключа потрібного провайдера прогони не запускаються.")}
        </p>
      </header>
      <ApiKeysManager initialKeys={keys} canManage={canManageKeys} />
      {!canManageKeys && (
        <p className="text-sm text-muted-foreground">
          {t("Керувати ключами можуть лише власник і адміністратор акаунта.")}
        </p>
      )}
    </section>
  );

  const teamPanel = (
    <section className="flex flex-col gap-4">
      <header className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold tracking-tight">{t("Команда")}</h2>
        <p className="text-sm text-muted-foreground">
          {t("Додавайте користувачів у акаунт і призначайте ролі. Роль визначає, що людина може робити.")}
        </p>
      </header>
      {canManageTeam ? (
        <MembersManager
          accountId={session.account.id}
          currentUserId={session.user.id}
          initialMembers={members}
        />
      ) : (
        <p className="text-sm text-muted-foreground">
          {t("Керувати командою можуть лише власник і адміністратор акаунта.")}
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
      <ConnectionsManager initialConnections={connections} canManage={canManageConnections} />
      {!canManageConnections && (
        <p className="text-sm text-muted-foreground">
          {t("Керувати підключеннями можуть лише власник і адміністратор акаунта.")}
        </p>
      )}
    </section>
  );

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t("Налаштування")}</h1>
        <p className="text-muted-foreground">
          {t("Загальні налаштування акаунта: ключі API, команда та підключення.")}
        </p>
      </header>

      <SettingsTabs
        initialTab={initialTab}
        keysPanel={keysPanel}
        teamPanel={teamPanel}
        connectionsPanel={connectionsPanel}
      />
    </div>
  );
}
