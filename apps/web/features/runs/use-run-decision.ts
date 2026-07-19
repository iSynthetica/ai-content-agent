"use client";

// HITL на рівні run (spike-3 §10.2). POST /api/runs/:id/decision, тіло { action, feedback }.
// action ∈ approve|reject|rerun — ЄДИНИЙ ендпойнт рішення (без окремих approve/reject-шляхів).
// Як саме це резюмить граф — вирішує api/worker; web шле лише доменне рішення (тверда межа).
// Без optimistic на статус run (api сам обирає наступний стан) — надійна інвалідація після settle.
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { DecisionRequest } from "@forteq/shared";

import { http } from "@/lib/http";
import { endpoints } from "@/lib/endpoints";
import { qk } from "@/lib/query-keys";

export function useRunDecision(runId: string, companyId: string) {
  const qc = useQueryClient();
  return useMutation({
    // Відповідь не парсимо схемою: форма ще не зафіксована контрактом, канонічний стан беремо
    // з інвалідації (рефетч run/items). Помилки — глобальний mutationCache.onError (toast).
    mutationFn: (body: DecisionRequest) => http.post(endpoints.runDecision(runId), body),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: qk.run(runId) });
      qc.invalidateQueries({ queryKey: qk.items(runId) });
      qc.invalidateQueries({ queryKey: qk.runs(companyId) });
    },
  });
}
