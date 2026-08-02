"use client";

// Revert поста до обраної версії (§content-editing). POST /api/content-items/:id/revert
// { versionId } → оновлений contentItemDTO. Append-only на бекенді (revert сам пише нову
// human-версію), тож тут — так само пряме оновлення кешу items + інвалідація історії.
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { http } from "@/lib/http";
import { endpoints } from "@/lib/endpoints";
import { qk } from "@/lib/query-keys";
import { contentItemDTO } from "@forteq/shared";
import type { ContentItemDTO } from "@/features/content/schemas";

export interface ItemRevertVars {
  itemId: string;
  versionId: string;
}

export function useItemRevert(runId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ itemId, versionId }: ItemRevertVars) =>
      http.post(endpoints.itemRevert(itemId), { versionId }, contentItemDTO),
    onSuccess: (updated, { itemId }) => {
      qc.setQueryData<ContentItemDTO[]>(qk.items(runId), (old) =>
        old?.map((it) => (it.id === itemId ? updated : it)),
      );
      qc.invalidateQueries({ queryKey: qk.itemVersions(itemId) });
    },
  });
}
