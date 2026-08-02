"use client";

// Generate → створити run (spike-3 §9). POST /api/companies/:cid/runs, тіло {} або { planEntryIds }.
// companyId — у ШЛЯХУ (канон), не в тілі. Відповідь — { runId }. Навігацію на /runs/:id робить
// викликач (GenerateButton), тут — лише мутація + інвалідація списку.
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createRunResponse } from "@forteq/shared";

import { http } from "@/lib/http";
import { endpoints } from "@/lib/endpoints";
import { qk } from "@/lib/query-keys";

export interface CreateRunInput {
  planEntryIds?: string[];
  channels?: string[];
  counts?: Record<string, number>;
  angle?: string;
  agentModels?: Record<string, { provider: string; model: string }> | null;
  saveAsDefault?: boolean;
}

export function useCreateRun(companyId: string) {
  const qc = useQueryClient();
  return useMutation({
    // Тіло — повна per-run конфігурація (§spec 08); zod на сервері відсіює зайве, undefined не йдуть.
    mutationFn: (input: CreateRunInput = {}) =>
      http.post(endpoints.runs(companyId), input, createRunResponse),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.runs(companyId) });
    },
  });
}
