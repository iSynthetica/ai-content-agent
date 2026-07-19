// Деталь прогону (spike-3 §9, §10). RSC робить перший знімок run + items напряму через apiClient
// (минаючи BFF-allowlist — trusted-серверний шлях, §2.2), далі клієнтський RunDetail бере кермо
// (polling/HITL). initialData прибирає клієнтський waterfall і миготіння (§8.5).
import { runDTO } from "@forteq/shared";

import { apiClient } from "@/server/api-client";
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

  const [run, items] = await Promise.all([
    apiClient.get(endpoints.run(runId), runDTO),
    apiClient.get(endpoints.items(runId), itemsResponse),
  ]);

  return <RunDetail runId={runId} initialRun={run} initialItems={items} />;
}
