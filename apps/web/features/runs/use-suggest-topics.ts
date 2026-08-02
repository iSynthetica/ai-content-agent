"use client";

// Topic preview (§runtopics): AI пропонує теми для ad-hoc прогону ще ДО генерації. Мутація ставить
// job (202 + draftId); поллінг стану — окремим таймером, обмеженим МАКС. к-стю спроб (правило
// поллінгу з §frontend-feature: без стелі поллінг живе вічно, якщо job впаде без запису статусу).
import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  suggestRunTopicsResponse,
  topicDraftDTO,
  type SuggestRunTopicsRequest,
} from "@forteq/shared";

import { http } from "@/lib/http";
import { endpoints } from "@/lib/endpoints";

export function useSuggestRunTopics(companyId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SuggestRunTopicsRequest) =>
      http.post(endpoints.suggestRunTopics(companyId), input, suggestRunTopicsResponse),
    onSuccess: ({ draftId }) => {
      // Прогріваємо кеш чернетки одразу зі статусом pending — перший poll не жде порожньою рукою.
      qc.setQueryData(["topic-draft", companyId, draftId], { status: "pending", topics: null, error: null });
    },
  });
}

const POLL_MS = 3000;
const MAX_POLLS = 40; // ~2 хв — довше означає, що job або впав без запису статусу, або завис

export function useTopicDraft(companyId: string, draftId: string | null) {
  // useRef, не локальна змінна: інакше лічильник скидався б на кожному рендері й межа не спрацювала б.
  const polls = React.useRef(0);
  return useQuery({
    queryKey: ["topic-draft", companyId, draftId],
    queryFn: () => http.get(endpoints.topicDraft(companyId, draftId!), topicDraftDTO),
    enabled: Boolean(draftId),
    refetchInterval: (q) => {
      if (q.state.data?.status !== "pending") {
        polls.current = 0;
        return false;
      }
      if (polls.current >= MAX_POLLS) return false;
      polls.current += 1;
      return POLL_MS;
    },
    refetchIntervalInBackground: false,
  });
}
