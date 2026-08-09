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
    // Прогін ВИДАЛЕНО назавжди. НЕ чіпаємо qk.run(runId): і invalidate, і remove поки деталь ще
    // змонтована спричинили б рефетч GET /runs/:id → 404 «run not found» (тост тягнеться на список
    // після редіректу). Оновлюємо ЛИШЕ список; редірект (у RunDetail.onSuccess) розмонтує деталь —
    // неактивний run-запит не рефетчиться, застаріле значення саме приберуться по gcTime.
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.runs(companyId) });
    },
  });

  return { archive, unarchive, remove };
}
