"use client";

// PUT /api/companies/:cid/settings — бренд + дефолти генерації (tone/visual/forbidden/language/
// provider/models). Тіло дзеркалить updateSettingsRequest із @forteq/shared.
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { z } from "zod";
import { updateSettingsRequest } from "@forteq/shared";

import { http } from "@/lib/http";
import { endpoints } from "@/lib/endpoints";
import { qk } from "@/lib/query-keys";
import { companySettingsDTO } from "@/lib/dto";

export type UpdateSettingsInput = z.infer<typeof updateSettingsRequest>;

export function useUpdateSettings(companyId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateSettingsInput) =>
      http.put(endpoints.settings(companyId), body, companySettingsDTO),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.settings(companyId) });
      qc.invalidateQueries({ queryKey: qk.company(companyId) });
    },
  });
}
