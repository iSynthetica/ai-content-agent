// Команда акаунта → керування членами (§RBAC member-mgmt F3). Активує наявний RBAC: owner/admin
// додають користувачів і призначають ролі. GET /members сам за member:manage, тож не-менеджеру не
// тягнемо (був би 403) — показуємо повідомлення. Гейт беремо з ролі сесії (той самий акаунт api й
// обслужить через RLS), симетрично до сторінки ключів.
import { redirect } from "next/navigation";

import { apiClient } from "@/server/api-client";
import { getSession } from "@/server/auth";
import { endpoints } from "@/lib/endpoints";
import { membersResponse, can } from "@forteq/shared";
import { MembersManager } from "@/features/members/MembersManager";
import { getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function MembersPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const t = await getT();
  const canManage = can(session.account.role, "member:manage");
  const members = canManage
    ? (await apiClient.get(endpoints.members(session.account.id), membersResponse)).items
    : [];

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t("Команда")}</h1>
        <p className="text-muted-foreground">
          {t("Додавайте користувачів у акаунт і призначайте ролі. Роль визначає, що людина може робити.")}
        </p>
      </header>

      {canManage ? (
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
