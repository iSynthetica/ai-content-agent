"use client";

// HITL на рівні item (spike-3 §8.3, §10.1). POST /api/content-items/:id/decision { action, feedback }.
// Optimistic: одразу зсуваємо item_status у кеші (approve→approved, reject→rejected, rerun→needs_revision),
// на помилці — відкат; на settle — інвалідація items+run (counts/status могли змінитись) + списку ранів.
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { DecisionRequest } from "@forteq/shared";

import { http } from "@/lib/http";
import { endpoints } from "@/lib/endpoints";
import { qk } from "@/lib/query-keys";
import type { ItemStatus } from "@/lib/status";
import type { ContentItemDTO } from "@/features/content/schemas";

export interface ItemDecisionVars {
  itemId: string;
  action: DecisionRequest["action"];
  feedback?: string;
}

const NEXT_STATUS: Record<DecisionRequest["action"], ItemStatus> = {
  approve: "approved",
  reject: "rejected",
  rerun: "needs_revision",
};

export function useItemDecision(runId: string, companyId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: ItemDecisionVars) =>
      http.post(endpoints.itemDecision(v.itemId), { action: v.action, feedback: v.feedback }),
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: qk.items(runId) });
      const prev = qc.getQueryData<ContentItemDTO[]>(qk.items(runId));
      qc.setQueryData<ContentItemDTO[]>(qk.items(runId), (old) =>
        old?.map((it) => (it.id === v.itemId ? { ...it, status: NEXT_STATUS[v.action] } : it)),
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(qk.items(runId), ctx.prev);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: qk.items(runId) });
      qc.invalidateQueries({ queryKey: qk.run(runId) });
      qc.invalidateQueries({ queryKey: qk.runs(companyId) });
    },
  });
}
