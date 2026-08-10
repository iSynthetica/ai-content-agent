"use client";

// BYOK: ключі провайдерів КОМПАНІЇ (§per-company-settings). companyId скоупить усі виклики й
// query-key. list — статус для будь-якого члена; set/remove доступні лише owner/admin (сервер
// форсить apikey:manage, тут ховаємо контроли за canManage).
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { http } from "@/lib/http";
import { endpoints } from "@/lib/endpoints";
import { qk } from "@/lib/query-keys";
import { apiKeysResponse, type ApiKeyDTO, type ApiKeyProvider } from "@/lib/dto";

export function useApiKeys(companyId: string, initialData?: ApiKeyDTO[]) {
  return useQuery({
    queryKey: qk.apiKeys(companyId),
    queryFn: async () => (await http.get(endpoints.apiKeys(companyId), apiKeysResponse)).items,
    initialData,
  });
}

export function useSetApiKey(companyId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { provider: ApiKeyProvider; key: string; label?: string }) =>
      http.put(endpoints.apiKey(companyId, input.provider), {
        key: input.key,
        ...(input.label ? { label: input.label } : {}),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.apiKeys(companyId) }),
  });
}

export function useDeleteApiKey(companyId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (provider: ApiKeyProvider) => http.del(endpoints.apiKey(companyId, provider)),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.apiKeys(companyId) }),
  });
}
