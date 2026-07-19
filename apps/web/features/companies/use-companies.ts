"use client";

// Компанії обраного акаунта (company switcher). Ключ скоупиться accountId (spike-3 §8.2).
import { useQuery } from "@tanstack/react-query";
import type { z } from "zod";
import { companyDTO } from "@forteq/shared";

import { http } from "@/lib/http";
import { endpoints } from "@/lib/endpoints";
import { qk } from "@/lib/query-keys";
import { companiesResponse } from "@/lib/dto";

export type Company = z.infer<typeof companyDTO>;

export function useCompanies(accountId: string, initialData?: Company[]) {
  return useQuery({
    queryKey: qk.companies(accountId),
    queryFn: async () => (await http.get(endpoints.companies(accountId), companiesResponse)).items,
    initialData,
    enabled: !!accountId,
  });
}
