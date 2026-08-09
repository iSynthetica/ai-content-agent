"use client";

// §publishing: публікація схвалених постів + стан публікацій по прогону. Публікація — це фонова
// джоба (worker б'є в API соцмережі поза request-циклом), тож UI не отримує результат синхронно:
// POST /runs/:id/publish лише ставить у чергу, а стан доїжджає через окремий полл GET
// /runs/:id/publications (аналог §7.4 картинок: результат приходить ПІСЛЯ дії, тож потрібен власний
// таймер). Полл живе РІВНО поки є pending-публікація й глушиться після MAX_PUBLICATION_POLLS —
// інакше провалена джоба поллила б вічно (поллінг без стоп-умови = теча).
import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { http } from "@/lib/http";
import { endpoints } from "@/lib/endpoints";
import { qk } from "@/lib/query-keys";
import { publicationsResponse, type PublicationDTO } from "@/lib/dto";

const PUBLICATIONS_POLL_MS = 4000;
const MAX_PUBLICATION_POLLS = 45; // ~3 хв — стеля очікування завершення публікації

function hasPending(items: PublicationDTO[] | undefined): boolean {
  return Boolean(items?.some((p) => p.status === "pending"));
}

export function usePublications(runId: string, enabled = true) {
  const polls = React.useRef(0);

  return useQuery({
    queryKey: qk.publications(runId),
    queryFn: async () => (await http.get(endpoints.runPublications(runId), publicationsResponse)).items,
    enabled: enabled && !!runId,
    refetchInterval: (q) => {
      if (!hasPending(q.state.data)) {
        polls.current = 0; // усе завершилось (published/failed) — лічильник назад у нуль
        return false;
      }
      if (polls.current >= MAX_PUBLICATION_POLLS) return false;
      polls.current += 1;
      return PUBLICATIONS_POLL_MS;
    },
    refetchIntervalInBackground: false,
  });
}

export function usePublish(runId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (itemIds: string[]) => http.post(endpoints.runPublish(runId), { itemIds }),
    // Одразу тягнемо стан: з'явиться pending-рядок і полл підхопить його до published/failed.
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.publications(runId) }),
  });
}
