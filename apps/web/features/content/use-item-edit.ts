"use client";

// Людське редагування поста (§content-editing). PATCH /api/content-items/:id { text, title? } →
// оновлений contentItemDTO. На success — пряме оновлення кешу items (без рефетчу всього списку,
// картка вже показує нову правку) + інвалідація історії версій (з'явився новий source:'human' запис).
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { EditContentItemRequest } from "@forteq/shared";

import { http } from "@/lib/http";
import { endpoints } from "@/lib/endpoints";
import { qk } from "@/lib/query-keys";
import { contentItemDTO } from "@forteq/shared";
import type { ContentItemDTO } from "@/features/content/schemas";

export interface ItemEditVars {
  itemId: string;
  patch: EditContentItemRequest;
}

export function useItemEdit(runId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ itemId, patch }: ItemEditVars) =>
      http.patch(endpoints.itemEdit(itemId), patch, contentItemDTO),
    onSuccess: (updated, { itemId }) => {
      qc.setQueryData<ContentItemDTO[]>(qk.items(runId), (old) =>
        old?.map((it) => (it.id === itemId ? updated : it)),
      );
      qc.invalidateQueries({ queryKey: qk.itemVersions(itemId) });
    },
  });
}
