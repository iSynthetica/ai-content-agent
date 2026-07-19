"use client";

// PUT /api/companies/:cid/content-plan — config плану (cadence/pillars/topicMode/horizon/auto*)
// + дефолтні channelCounts. Тіло дзеркалить updateContentPlanRequest із @forteq/shared (§15).
// Крок 2 онбордингу (§13/§2.9) теж використовує цей хук для запропонованих pillars/cadence.
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { z } from "zod";
import { updateContentPlanRequest } from "@forteq/shared";

import { http } from "@/lib/http";
import { endpoints } from "@/lib/endpoints";
import { qk } from "@/lib/query-keys";
import { contentPlanResponse } from "@/lib/dto";

export type UpdatePlanConfigInput = z.infer<typeof updateContentPlanRequest>;

export function useUpdatePlanConfig(companyId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdatePlanConfigInput) =>
      http.put(endpoints.contentPlan(companyId), body, contentPlanResponse),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.plan(companyId) });
    },
  });
}
