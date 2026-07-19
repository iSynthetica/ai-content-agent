"use client";

// Один run + polling (spike-3 §8.3). Polling 2.5с лише поки граф працює (queued|running);
// needs_review/термінальні — стоп (§9: needs_review чекає рішення людини, не поллимо).
// Це ЄДИНИЙ polling-таймер сторінки run — картки рефетчаться реактивно від його апдейтів (§9 п.6).
import { useQuery } from "@tanstack/react-query";
import { runDTO } from "@forteq/shared";

import { http } from "@/lib/http";
import { endpoints } from "@/lib/endpoints";
import { qk } from "@/lib/query-keys";
import { isRunGenerating } from "@/lib/status";
import type { RunDTO } from "@/features/runs/schemas";

const RUN_POLL_MS = 2500;

export function useRun(runId: string, initialData?: RunDTO) {
  return useQuery({
    queryKey: qk.run(runId),
    queryFn: () => http.get(endpoints.run(runId), runDTO),
    initialData,
    enabled: !!runId,
    refetchInterval: (q) => (isRunGenerating(q.state.data?.status) ? RUN_POLL_MS : false),
    refetchIntervalInBackground: false,
  });
}
