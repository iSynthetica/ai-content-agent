"use client";

// Список ранів компанії (spike-3 §8.3, §9). RSC робить перший знімок → передає як initialData,
// далі клієнт бере кермо. Polling ~4с лише поки є НЕ термінальний run (queued|running|needs_review);
// коли всі термінальні — інтервал вимикається (false). Приховану вкладку не поллимо.
import { useQuery } from "@tanstack/react-query";

import { http } from "@/lib/http";
import { endpoints } from "@/lib/endpoints";
import { qk } from "@/lib/query-keys";
import { hasActiveRun } from "@/lib/status";
import { pagedRuns, type RunDTO } from "@/features/runs/schemas";

const LIST_POLL_MS = 4000;

// archived (§run-archive): "exclude" (дефолт) — основний список без архіву; "only" — окремий вигляд
// архіву компанії. Ключ архіву має спільний префікс ["runs", companyId], тож інвалідація
// qk.runs(companyId) з мутацій архіву перечитує обидва списки. Архів не поллимо (нема активних
// прогонів) і вмикаємо запит лише коли вкладку відкрито (enabled), щоб не тягнути його щоразу.
export function useRuns(
  companyId: string,
  initialData?: RunDTO[],
  archived: "exclude" | "only" | "all" = "exclude",
  enabled = true,
) {
  const isArchiveView = archived === "only";
  return useQuery({
    queryKey: isArchiveView ? qk.runsArchived(companyId) : qk.runs(companyId),
    queryFn: async () =>
      (await http.get(endpoints.runs(companyId, isArchiveView ? "only" : undefined), pagedRuns)).items,
    initialData,
    enabled: !!companyId && enabled,
    refetchInterval: (q) =>
      !isArchiveView && hasActiveRun(q.state.data ?? []) ? LIST_POLL_MS : false,
    refetchIntervalInBackground: false,
  });
}
