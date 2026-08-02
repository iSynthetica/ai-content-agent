// Налаштування акаунта → BYOK-ключі провайдерів (§ADR-0016). Ключі account-scoped: api резолвить
// акаунт із сесії + RLS, тож і гейт керування беремо з ролі сесії (саме той акаунт api й обслужить).
import { redirect } from "next/navigation";

import { apiClient } from "@/server/api-client";
import { getSession } from "@/server/auth";
import { endpoints } from "@/lib/endpoints";
import { apiKeysResponse, can } from "@forteq/shared";
import { ApiKeysManager } from "@/features/api-keys/ApiKeysManager";

export const dynamic = "force-dynamic";

export default async function AccountSettingsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const { items: keys } = await apiClient.get(endpoints.apiKeys(), apiKeysResponse);
  const canManage = can(session.account.role, "apikey:manage");

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Ключі API</h1>
        <p className="text-muted-foreground">
          Свій ключ провайдера на акаунт: генерація оплачується вашим ключем. Без ключа потрібного
          провайдера прогони не запускаються.
        </p>
      </header>

      <ApiKeysManager initialKeys={keys} canManage={canManage} />

      {!canManage && (
        <p className="text-sm text-muted-foreground">
          Керувати ключами можуть лише власник і адміністратор акаунта.
        </p>
      )}
    </div>
  );
}
