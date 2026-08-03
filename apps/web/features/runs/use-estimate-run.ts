"use client";

// Пре-ран оцінка вартості (Phase 4): POST /api/companies/:cid/runs/estimate тим САМИМ тілом, що
// піде у createRun — сервер резолвить лічильники/моделі однаково й повертає прикидку. useQuery
// (не мутація), щоб оцінка автоматично оновлювалась, коли людина міняє конфіг на кроці review.
import { useQuery } from "@tanstack/react-query";
import { runCostEstimateResponse, type RunCostEstimateResponse } from "@forteq/shared";

import { http } from "@/lib/http";
import { endpoints } from "@/lib/endpoints";

// Тіло — той самий підмножинний контракт createRun (undefined-поля zod відсіює).
export type EstimateBody = Record<string, unknown>;

export function useEstimateRun(companyId: string, body: EstimateBody | null) {
  return useQuery<RunCostEstimateResponse>({
    // Ключ несе серіалізоване тіло — зміна конфігу (counts/моделі/теми) рефетчить.
    queryKey: ["run-estimate", companyId, JSON.stringify(body)],
    queryFn: () => http.post(endpoints.runEstimate(companyId), body ?? {}, runCostEstimateResponse),
    enabled: body !== null,
    staleTime: 30_000,
  });
}
