// Загальні (account-scoped) налаштування (§per-company-settings). Раніше хаб зводив три підрозділи
// (ключі/команда/підключення); ключі та підключення переїхали в company-scoped
// /companies/[id]/settings, тож тут лишається ЛИШЕ «Команда» (керування членами акаунта — це
// account-рівень). Сторінка рендериться однією секцією без табів.
//
// SSR: тягнемо членів акаунта (GET /members гейтиться member:manage). /members і старий /connections
// редіректять сюди/на company-settings відповідно.
import { redirect } from "next/navigation";

import { apiClient } from "@/server/api-client";
import { getSession } from "@/server/auth";
import { endpoints } from "@/lib/endpoints";
import { membersResponse, can } from "@forteq/shared";
import { MembersManager } from "@/features/members/MembersManager";
import { getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const t = await getT();
  const canManageTeam = can(session.account.role, "member:manage");

  // GET /members гейтиться member:manage (не-менеджеру дав би 403), тож тягнемо лише під canManageTeam.
  const members = canManageTeam
    ? await apiClient
        .get(endpoints.members(session.account.id), membersResponse)
        .then((r) => r.items)
    : [];

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t("Команда")}</h1>
        <p className="text-muted-foreground">
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
    </div>
  );
}
