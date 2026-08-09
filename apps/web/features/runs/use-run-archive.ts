"use client";

// §run-archive: архів / розархів / незворотне видалення ЦІЛОГО прогону. Три мутації без optimistic —
// runId передається як змінна мутації (щоб один хук обслуговував і список прогонів, і деталь прогону).
// Після успіху інвалідуємо список прогонів компанії (прогін «переїжджає» між основним списком і
// архівом — префікс ["runs", companyId] зачіпає обидва) + сам прогін.
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { runDTO } from "@forteq/shared";

import { http } from "@/lib/http";
import { endpoints } from "@/lib/endpoints";
import { qk } from "@/lib/query-keys";

export function useRunArchive(companyId: string) {
  const qc = useQueryClient();

  const invalidate = (runId: string) => {
    qc.invalidateQueries({ queryKey: qk.runs(companyId) });
    qc.invalidateQueries({ queryKey: qk.run(runId) });
  };

  const archive = useMutation({
    mutationFn: (runId: string) => http.post(endpoints.runArchive(runId), undefined, runDTO),
    onSuccess: (_r, runId) => invalidate(runId),
  });

  const unarchive = useMutation({
    mutationFn: (runId: string) => http.post(endpoints.runUnarchive(runId), undefined, runDTO),
    onSuccess: (_r, runId) => invalidate(runId),
  });

  const remove = useMutation({
    mutationFn: (runId: string) => http.del(endpoints.runDelete(runId)),
    onSuccess: (_r, runId) => invalidate(runId),
  });

  return { archive, unarchive, remove };
}
