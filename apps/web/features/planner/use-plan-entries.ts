"use client";

// Слоти контент-плану (§2.11). Планування відокремлене від генерації: тут керуємо СЛОТАМИ —
// коли і в який канал публікуємо, — а запуск прогону йде окремо, з обраними слотами.
import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { planEntryDTO } from "@forteq/shared";

import { http } from "@/lib/http";
import { endpoints } from "@/lib/endpoints";
import { qk } from "@/lib/query-keys";

const entriesResponse = z.object({ items: z.array(planEntryDTO) });
export type PlanEntry = z.infer<typeof planEntryDTO>;

// Теми підбираються фоновою job'ою, тож після запиту слоти оновлюються не одразу. Поллимо,
// поки є слот без теми, але з межею — інакше план, який модель не змогла заповнити, поллився б вічно.
const SUGGEST_POLL_MS = 4000;
const MAX_POLLS = 20;

export function usePlanEntries(companyId: string) {
  // useRef, а не звичайний об'єкт: локальна змінна скидалась би на кожному рендері, лічильник
  // ніколи не досягав би межі, і поллінг став би вічним — саме те, від чого межа й потрібна.
  const polls = React.useRef(0);
  return useQuery({
    queryKey: qk.planEntries(companyId),
    queryFn: () => http.get(endpoints.planEntries(companyId), entriesResponse),
    refetchInterval: (q) => {
      const items = q.state.data?.items ?? [];
      const pending = items.some((i) => !i.topic);
      if (!pending) {
        polls.current = 0;
        return false;
      }
      if (polls.current >= MAX_POLLS) return false;
      polls.current += 1;
      return SUGGEST_POLL_MS;
    },
    refetchIntervalInBackground: false,
  });
}

export function useMaterializePlan(companyId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      http.post(
        endpoints.planMaterialize(companyId),
        {},
        z.object({ created: z.number(), skipped: z.number() }),
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.planEntries(companyId) }),
  });
}

export function useSuggestTopics(companyId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (planEntryIds?: string[]) =>
      http.post(endpoints.planSuggest(companyId), planEntryIds ? { planEntryIds } : {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.planEntries(companyId) }),
  });
}

export function useUpdateEntry(companyId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; topic?: string; keyMessage?: string; pillar?: string }) => {
      const { id, ...patch } = input;
      return http.patch(endpoints.planEntry(id), patch, planEntryDTO);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.planEntries(companyId) }),
  });
}

export function useApproveEntries(companyId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) =>
      http.post(
        endpoints.planEntriesApprove(),
        { ids },
        z.object({ approved: z.number(), requested: z.number() }),
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.planEntries(companyId) }),
  });
}
