"use client";

// BYOK: ключі провайдерів акаунта (§ADR-0016). list — статус для будь-якого члена; set/remove
// доступні лише owner/admin (сервер форсить apikey:manage, тут ховаємо контроли за canManage).
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { http } from "@/lib/http";
import { endpoints } from "@/lib/endpoints";
import { qk } from "@/lib/query-keys";
import { apiKeysResponse, type ApiKeyDTO, type ApiKeyProvider } from "@/lib/dto";

export function useApiKeys(initialData?: ApiKeyDTO[]) {
  return useQuery({
    queryKey: qk.apiKeys(),
    queryFn: async () => (await http.get(endpoints.apiKeys(), apiKeysResponse)).items,
    initialData,
  });
}

export function useSetApiKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { provider: ApiKeyProvider; key: string; label?: string }) =>
      http.put(endpoints.apiKey(input.provider), {
        key: input.key,
        ...(input.label ? { label: input.label } : {}),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.apiKeys() }),
  });
}

export function useDeleteApiKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (provider: ApiKeyProvider) => http.del(endpoints.apiKey(provider)),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.apiKeys() }),
  });
}
