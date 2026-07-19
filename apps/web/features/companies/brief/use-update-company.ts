"use client";

// PATCH /api/companies/:cid — правка company core (name/positioning/stack/services/audience,
// а також websiteUrl/description). Тіло дзеркалить updateCompanyRequest із @forteq/shared.
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { z } from "zod";
import { companyDTO, updateCompanyRequest } from "@forteq/shared";

import { http } from "@/lib/http";
import { endpoints } from "@/lib/endpoints";
import { qk } from "@/lib/query-keys";

export type UpdateCompanyInput = z.infer<typeof updateCompanyRequest>;

export function useUpdateCompany(companyId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateCompanyInput) =>
      http.patch(endpoints.company(companyId), body, companyDTO),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.company(companyId) });
    },
  });
}
