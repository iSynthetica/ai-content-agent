"use client";

// Керування членами акаунта (§RBAC member-mgmt F3). Список + додати/змінити роль/видалити.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  addMemberResponse,
  memberDTO,
  membersResponse,
  type MemberDTO,
} from "@forteq/shared";

import { http } from "@/lib/http";
import { endpoints } from "@/lib/endpoints";

const membersKey = (accountId: string) => ["members", accountId] as const;

export function useMembers(accountId: string, initial?: MemberDTO[]) {
  return useQuery<MemberDTO[]>({
    queryKey: membersKey(accountId),
    queryFn: async () => (await http.get(endpoints.members(accountId), membersResponse)).items,
    initialData: initial,
    staleTime: 30_000,
  });
}

export function useAddMember(accountId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { email: string; role: string }) =>
      http.post(endpoints.members(accountId), body, addMemberResponse),
    onSuccess: () => qc.invalidateQueries({ queryKey: membersKey(accountId) }),
  });
}

export function useChangeMemberRole(accountId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: string }) =>
      http.patch(endpoints.member(accountId, userId), { role }, memberDTO),
    onSuccess: () => qc.invalidateQueries({ queryKey: membersKey(accountId) }),
  });
}

export function useRemoveMember(accountId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => http.del(endpoints.member(accountId, userId)),
    onSuccess: () => qc.invalidateQueries({ queryKey: membersKey(accountId) }),
  });
}
