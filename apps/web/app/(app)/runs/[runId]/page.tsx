// Деталь прогону (spike-3 §9, §10). RSC робить перший знімок run + items напряму через apiClient
// (минаючи BFF-allowlist — trusted-серверний шлях, §2.2), далі клієнтський RunDetail бере кермо
// (polling/HITL). initialData прибирає клієнтський waterfall і миготіння (§8.5).
import { can, runDTO } from "@forteq/shared";

import { apiClient } from "@/server/api-client";
import { getSession } from "@/server/auth";
import { endpoints } from "@/lib/endpoints";
import { itemsResponse } from "@/features/content/schemas";
import { RunDetail } from "@/features/runs/RunDetail";

export const dynamic = "force-dynamic";

export default async function RunPage({
  params,
}: {
  params: Promise<{ runId: string }>;
}) {
  const { runId } = await params;

  const [run, items, session] = await Promise.all([
    apiClient.get(endpoints.run(runId), runDTO),
    apiClient.get(endpoints.items(runId), itemsResponse),
    getSession(),
  ]);

  // §content-editing: гейт Edit/Revert рахуємо тут, з ролі сесії — той самий підхід, що й
  // settings/page.tsx (canManage). Немає сесії (не мало б статись під (app)-гейтом) → безпечний deny.
  const canEdit = session ? can(session.account.role, "content:edit") : false;
  // §publishing: гейт кнопки «Опублікувати» — той самий сесія-рівневий підхід (сервер форсить
  // publish:manage; ховаємо недоступну дію).
  const canPublish = session ? can(session.account.role, "publish:manage") : false;

  return (
    <RunDetail
      runId={runId}
      initialRun={run}
      initialItems={items}
      canEdit={canEdit}
      canPublish={canPublish}
    />
  );
}
