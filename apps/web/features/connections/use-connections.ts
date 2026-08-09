"use client";

// §publishing: підключення сервіс-акаунтів (OAuth соцмереж) + конфіг Telegram. list — статус для
// будь-якого члена (RLS ізолює акаунт); authorize/configure/disconnect гейтяться connection:manage
// (сервер форсить 403; у UI ховаємо контроли за canManage). OAuth-токени НІКОЛИ не повертаються —
// connectionDTO містить лише метадані (як last4 у BYOK, §ADR-0016).
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { http } from "@/lib/http";
import { endpoints } from "@/lib/endpoints";
import { qk } from "@/lib/query-keys";
import {
  connectionsResponse,
  authorizeConnectionResponse,
  type ConnectionsResponse,
  type PublishProvider,
  type SetAppCredentialsRequest,
  type TelegramConfigRequest,
} from "@/lib/dto";

export function useConnections(initialData?: ConnectionsResponse) {
  return useQuery({
    queryKey: qk.connections(),
    queryFn: () => http.get(endpoints.connections(), connectionsResponse),
    initialData,
  });
}

// authorize → { authUrl }. Викликач сам робить window.location.assign(authUrl): редірект на consent
// провайдера — це навігація браузера, не fetch, тож мутація лише дістає URL.
export function useAuthorize() {
  return useMutation({
    mutationFn: (provider: PublishProvider) =>
      http.post(endpoints.connectionAuthorize(provider), undefined, authorizeConnectionResponse),
  });
}

// BYO-app: зберегти креди власного OAuth-застосунку орендаря (client id + secret) для провайдера.
// Секрет назад НІКОЛИ не приходить; після успіху інвалідуємо connections (appConfigured/appClientId).
export function useSetAppCredentials() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ provider, input }: { provider: PublishProvider; input: SetAppCredentialsRequest }) =>
      http.put(endpoints.connectionAppCredentials(provider), input),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.connections() }),
  });
}

export function useConfigureTelegram() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: TelegramConfigRequest) => http.put(endpoints.connectionTelegram(), input),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.connections() }),
  });
}

export function useDisconnect() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (provider: string) => http.del(endpoints.connection(provider)),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.connections() }),
  });
}
