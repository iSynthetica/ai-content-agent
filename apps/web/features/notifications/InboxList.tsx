"use client";

// Inbox (§2.13) — задачі, що ЧЕКАЮТЬ ДІЇ людини, на відміну від інформаційних сповіщень.
// Кожна задача веде на сутність (deep-link з каталогу подій) і закривається або вручну,
// або автоматично — коли рішення по сутності вже ухвалене (worker закриває її сам).
import Link from "next/link";
import { CheckCircle2, Inbox as InboxIcon, ShieldAlert } from "lucide-react";
import { inboxDeepLink } from "@forteq/shared";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useInbox, useResolveInbox } from "@/features/notifications/use-notifications";
import { formatDateTime } from "@/lib/format";
import { useLanguage } from "@/lib/i18n";

export function InboxList() {
  const { t, language } = useLanguage();
  const inbox = useInbox();
  const resolve = useResolveInbox();

  const items = inbox.data?.items ?? [];

  if (inbox.isLoading) {
    return <p className="text-sm text-muted-foreground">{t("Завантаження…")}</p>;
  }

  if (items.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
          <CheckCircle2 className="size-8 text-success" aria-hidden />
          <p className="font-medium">{t("Немає задач")}</p>
          <p className="text-sm text-muted-foreground">
            {t("Коли прогін завершиться і пости чекатимуть на рецензію, задача з’явиться тут.")}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {items.map((item) => {
        const href = inboxDeepLink(item.entityType, item.entityId);
        return (
          <Card key={item.id}>
            <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
              <div className="flex items-start gap-3">
                <ShieldAlert className="mt-0.5 size-5 shrink-0 text-warning" aria-hidden />
                <div className="flex flex-col gap-0.5">
                  <span className="font-medium">{item.title}</span>
                  <span className="text-xs text-muted-foreground">
                    {formatDateTime(item.createdAt, language)}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {href && (
                  <Button asChild size="sm">
                    <Link href={href}>{t("Перейти")}</Link>
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => resolve.mutate(item.id)}
                  disabled={resolve.isPending}
                >
                  {t("Виконано")}
                </Button>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

export function InboxHeader() {
  const inbox = useInbox();
  const open = inbox.data?.openCount ?? 0;
  return (
    <div className="flex items-center gap-2">
      <InboxIcon className="size-5 text-muted-foreground" aria-hidden />
      <h1 className="text-xl font-semibold tracking-tight">Inbox</h1>
      {open > 0 && <span className="text-sm text-muted-foreground">· {open}</span>}
    </div>
  );
}
