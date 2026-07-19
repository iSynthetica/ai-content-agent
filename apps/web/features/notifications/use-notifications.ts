"use client";

// Дзвіночок і Inbox (§2.13). Два РІЗНІ запити з різною частотою: інформаційні нотифікації
// оновлюються рідше (30с), actionable-задачі — частіше (15с), бо саме вони чекають на дію.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { inboxResponse, notificationsResponse } from "@forteq/shared";

import { http } from "@/lib/http";
import { endpoints } from "@/lib/endpoints";

const NOTIF_POLL_MS = 30_000;
const INBOX_POLL_MS = 15_000;

const qkNotifications = ["notifications"] as const;
const qkInbox = ["inbox"] as const;

export function useNotifications() {
  return useQuery({
    queryKey: qkNotifications,
    queryFn: () => http.get(endpoints.notifications(), notificationsResponse),
    refetchInterval: NOTIF_POLL_MS,
    refetchIntervalInBackground: false,
  });
}

export function useInbox() {
  return useQuery({
    queryKey: qkInbox,
    queryFn: () => http.get(endpoints.inbox(), inboxResponse),
    refetchInterval: INBOX_POLL_MS,
    refetchIntervalInBackground: false,
  });
}

export function useMarkAllRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => http.post(endpoints.notifReadAll(), undefined),
    onSuccess: () => qc.invalidateQueries({ queryKey: qkNotifications }),
  });
}

export function useMarkRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => http.post(endpoints.notifRead(id), undefined),
    onSuccess: () => qc.invalidateQueries({ queryKey: qkNotifications }),
  });
}

export function useResolveInbox() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => http.post(endpoints.inboxResolve(id), undefined),
    onSuccess: () => qc.invalidateQueries({ queryKey: qkInbox }),
  });
}
