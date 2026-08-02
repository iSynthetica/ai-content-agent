"use client";

// Дзвіночок (§2.13): інформаційні нотифікації + лічильник actionable-задач Inbox.
//
// Свідомо показуємо ДВА різні числа з різною вагою: бейдж на іконці — це кількість задач, що
// ЧЕКАЮТЬ ДІЇ (inbox), бо саме вони блокують роботу; непрочитані інформаційні нотифікації —
// це лише історія і на бейдж не впливають. Інакше «5» на дзвіночку означало б незрозуміло що.
import Link from "next/link";
import { Bell, Inbox as InboxIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useInbox, useMarkAllRead, useNotifications } from "@/features/notifications/use-notifications";
import { formatDateTime } from "@/lib/format";
import { useLanguage } from "@/lib/i18n";

export function NotificationBell() {
  const { t, language } = useLanguage();
  const notifications = useNotifications();
  const inbox = useInbox();
  const markAll = useMarkAllRead();

  const items = notifications.data?.items ?? [];
  const unread = notifications.data?.unreadCount ?? 0;
  const openTasks = inbox.data?.openCount ?? 0;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={`${t("Сповіщення")}${openTasks ? `, ${t("задач")}: ${openTasks}` : ""}`} className="relative">
          <Bell />
          {openTasks > 0 && (
            <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-warning px-1 text-[10px] font-medium text-warning-foreground">
              {openTasks > 9 ? "9+" : openTasks}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-80">
        {openTasks > 0 && (
          <>
            <DropdownMenuItem asChild>
              <Link href="/inbox" className="flex items-center gap-2 font-medium">
                <InboxIcon className="size-4 text-warning" />
                {t("Потребують дії")}: {openTasks}
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}

        <DropdownMenuLabel className="flex items-center justify-between">
          <span>{t("Сповіщення")}</span>
          {unread > 0 && (
            <button
              type="button"
              className="text-xs font-normal text-muted-foreground hover:text-foreground"
              onClick={() => markAll.mutate()}
              disabled={markAll.isPending}
            >
              {t("Прочитати всі")}
            </button>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        {items.length === 0 ? (
          <p className="px-2 py-6 text-center text-sm text-muted-foreground">{t("Сповіщень немає")}</p>
        ) : (
          <div className="max-h-80 overflow-y-auto">
            {items.slice(0, 12).map((n) => (
              <div
                key={n.id}
                className={`flex flex-col gap-0.5 px-2 py-2 text-sm ${n.readAt ? "opacity-60" : ""}`}
              >
                <span className="font-medium">{n.title}</span>
                {n.body && <span className="text-xs text-muted-foreground">{n.body}</span>}
                <span className="text-xs text-muted-foreground">{formatDateTime(n.createdAt, language)}</span>
              </div>
            ))}
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
