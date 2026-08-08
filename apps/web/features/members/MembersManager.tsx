"use client";

// Екран «Команда» (§RBAC member-mgmt F3). Показується лише коли canManage (page гейтить за
// member:manage, і сам GET /members теж). Дії над СОБОЮ заблоковані в UI (сервер теж 422).
// Найважливіше UX: одноразовий tempPassword нового члена показуємо ЯВНО (сервер віддає раз).
import { useState } from "react";
import { toast } from "sonner";
import { ROLES, type MemberDTO } from "@forteq/shared";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useT } from "@/lib/i18n";
import {
  useAddMember,
  useChangeMemberRole,
  useMembers,
  useRemoveMember,
} from "@/features/members/use-members";

export function MembersManager({
  accountId,
  currentUserId,
  initialMembers,
}: {
  accountId: string;
  currentUserId: string;
  initialMembers: MemberDTO[];
}) {
  const t = useT();
  const membersQuery = useMembers(accountId, initialMembers);
  const addMember = useAddMember(accountId);
  const changeRole = useChangeMemberRole(accountId);
  const removeMember = useRemoveMember(accountId);

  const [email, setEmail] = useState("");
  const [role, setRole] = useState<string>("editor");
  // Одноразовий пароль нового члена — тримаємо, доки owner не закриє (сервер віддає лише раз).
  const [invited, setInvited] = useState<{ email: string; tempPassword: string } | null>(null);

  const members = membersQuery.data ?? initialMembers;

  function submitAdd() {
    const e = email.trim().toLowerCase();
    if (!e) return;
    addMember.mutate(
      { email: e, role },
      {
        onSuccess: (res) => {
          setEmail("");
          if (res.tempPassword) {
            setInvited({ email: res.member.email, tempPassword: res.tempPassword });
          } else {
            toast.success(`${res.member.email}: ${t("додано (наявний обліковий запис)")}`);
          }
        },
        onError: (err) => toast.error((err as Error)?.message ?? t("Не вдалося додати члена")),
      },
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Одноразовий пароль запрошеного */}
      {invited && (
        <div className="rounded-md border border-primary/40 bg-primary/5 p-4 text-sm">
          <p className="font-medium text-foreground">
            {t("Тимчасовий пароль для")} {invited.email}
          </p>
          <div className="mt-2 flex items-center gap-2">
            <code className="rounded bg-muted px-2 py-1 font-mono text-sm">{invited.tempPassword}</code>
            <Button
              variant="ghost"
              onClick={() => {
                navigator.clipboard?.writeText(invited.tempPassword);
                toast.success(t("Скопійовано"));
              }}
            >
              {t("Копіювати")}
            </Button>
            <Button variant="ghost" onClick={() => setInvited(null)}>
              {t("Готово")}
            </Button>
          </div>
          <p className="mt-2 text-muted-foreground">
            {t("Передайте пароль користувачу — показується лише раз. Він увійде за цим email і паролем.")}
          </p>
        </div>
      )}

      {/* Додати члена */}
      <div className="flex flex-col gap-2 rounded-md border border-border p-4">
        <Label>{t("Додати члена")}</Label>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            type="email"
            placeholder={t("email користувача")}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="flex-1"
            aria-label={t("email користувача")}
          />
          <select
            aria-label={t("Роль")}
            className="h-9 rounded-md border border-border bg-background px-2 text-sm"
            value={role}
            onChange={(e) => setRole(e.target.value)}
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <Button onClick={submitAdd} disabled={addMember.isPending || !email.trim()}>
            {addMember.isPending ? t("Додаємо…") : t("Додати")}
          </Button>
        </div>
      </div>

      {/* Список членів */}
      <div className="flex flex-col gap-2">
        <Label>{t("Члени акаунта")}</Label>
        <ul className="flex flex-col divide-y divide-border rounded-md border border-border">
          {members.map((m) => {
            const isSelf = m.userId === currentUserId;
            return (
              <li key={m.userId} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">
                    {m.email}
                    {isSelf && <span className="ml-1 text-muted-foreground">({t("ви")})</span>}
                  </p>
                  {m.name && <p className="truncate text-xs text-muted-foreground">{m.name}</p>}
                </div>
                <div className="flex items-center gap-2">
                  <select
                    aria-label={`${t("Роль")} ${m.email}`}
                    className="h-8 rounded-md border border-border bg-background px-2 text-sm disabled:opacity-50"
                    value={m.role}
                    disabled={isSelf || changeRole.isPending}
                    onChange={(e) =>
                      changeRole.mutate(
                        { userId: m.userId, role: e.target.value },
                        {
                          onError: (err) =>
                            toast.error((err as Error)?.message ?? t("Не вдалося змінити роль")),
                        },
                      )
                    }
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                  <Button
                    variant="ghost"
                    disabled={isSelf || removeMember.isPending}
                    onClick={() => {
                      if (!window.confirm(`${t("Видалити члена")} ${m.email}?`)) return;
                      removeMember.mutate(m.userId, {
                        onSuccess: () => toast.success(`${m.email}: ${t("видалено")}`),
                        onError: (err) =>
                          toast.error((err as Error)?.message ?? t("Не вдалося видалити члена")),
                      });
                    }}
                  >
                    {t("Видалити")}
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
