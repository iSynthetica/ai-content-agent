"use client";

// Run-config пресети (§Phase 5): список + збереження + видалення named-конфігів прогону.
// Список — useQuery; create/delete — мутації з інвалідацією списку.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  runPresetsResponse,
  runPresetDTO,
  type RunPresetConfig,
  type RunPresetDTO,
} from "@forteq/shared";

import { http } from "@/lib/http";
import { endpoints } from "@/lib/endpoints";

const presetsKey = (companyId: string) => ["run-presets", companyId] as const;

export function usePresets(companyId: string) {
  return useQuery<RunPresetDTO[]>({
    queryKey: presetsKey(companyId),
    queryFn: async () => (await http.get(endpoints.presets(companyId), runPresetsResponse)).items,
    staleTime: 60_000,
  });
}

export function useCreatePreset(companyId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string; config: RunPresetConfig }) =>
      http.post(endpoints.presets(companyId), input, runPresetDTO),
    onSuccess: () => qc.invalidateQueries({ queryKey: presetsKey(companyId) }),
  });
}

export function useDeletePreset(companyId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => http.del(endpoints.preset(id)),
    onSuccess: () => qc.invalidateQueries({ queryKey: presetsKey(companyId) }),
  });
}
