"use client";

// Акаунти поточного user (switcher). RSC-layout передає знімок як initialData → без клієнтського
// waterfall на першому екрані (spike-3 §8.5).
import { useQuery } from "@tanstack/react-query";

import { http } from "@/lib/http";
import { endpoints } from "@/lib/endpoints";
import { qk } from "@/lib/query-keys";
import { accountsResponse, type AccountDTO } from "@/lib/dto";

export function useAccounts(initialData?: AccountDTO[]) {
  return useQuery({
    queryKey: qk.accounts(),
    queryFn: async () => (await http.get(endpoints.accounts(), accountsResponse)).items,
    initialData,
  });
}
