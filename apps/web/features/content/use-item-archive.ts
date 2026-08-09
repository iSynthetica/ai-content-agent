"use client";

// §post-archive: архів / розархів / незворотне видалення поста. Три мутації без optimistic —
// після успіху інвалідуємо items-запити прогону (пост «переїжджає» між основним списком і архівом),
// плюс run/список ранів (лічильники могли змінитись). Delete додатково скидає кеш історії версій.
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { contentItemDTO } from "@forteq/shared";

import { http } from "@/lib/http";
import { endpoints } from "@/lib/endpoints";
import { qk } from "@/lib/query-keys";

export function useItemArchive(runId: string, companyId: string) {
  const qc = useQueryClient();

  // Префіксна інвалідація ["items", runId] зачіпає і основний список (exclude), і архівний вигляд
  // (["items", runId, "archived"]) — обидва мають перечитатись після переміщення поста.
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: qk.items(runId) });
    qc.invalidateQueries({ queryKey: qk.run(runId) });
    qc.invalidateQueries({ queryKey: qk.runs(companyId) });
  };

  const archive = useMutation({
    mutationFn: (itemId: string) =>
      http.post(endpoints.itemArchive(itemId), undefined, contentItemDTO),
    onSuccess: invalidate,
  });

  const unarchive = useMutation({
    mutationFn: (itemId: string) =>
      http.post(endpoints.itemUnarchive(itemId), undefined, contentItemDTO),
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: (itemId: string) => http.del(endpoints.itemDelete(itemId)),
    onSuccess: (_res, itemId) => {
      qc.removeQueries({ queryKey: qk.itemVersions(itemId) });
      invalidate();
    },
  });

  return { archive, unarchive, remove };
}
