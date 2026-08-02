"use client";

// Історія версій поста (§content-editing). GET /api/content-items/:id/versions — читає будь-який
// член акаунта. Ледаче: запит іде лише коли діалог історії відкрито (enabled), а не на кожній картці.
import { useQuery } from "@tanstack/react-query";

import { http } from "@/lib/http";
import { endpoints } from "@/lib/endpoints";
import { qk } from "@/lib/query-keys";
import { itemVersionsResponse } from "@/features/content/schemas";

export function useItemVersions(itemId: string, enabled: boolean) {
  return useQuery({
    queryKey: qk.itemVersions(itemId),
    queryFn: () => http.get(endpoints.itemVersions(itemId), itemVersionsResponse),
    enabled,
  });
}
