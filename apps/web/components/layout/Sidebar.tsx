"use client";

// Ліва навігація AppShell (DS §7). Стримано, hairline-бордер справа. Активний пункт — за
// usePathname. Компанійні лінки скоупляться поточним companyId (з useParams); поки компанії
// немає — показуємо лише глобальні пункти (Inbox).
import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import {
  CalendarDays,
  Inbox,
  LayoutDashboard,
  Settings2,
  Sparkles,
  SquarePen,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

export function Sidebar() {
  const pathname = usePathname();
  const params = useParams<{ companyId?: string }>();
  const cid = params.companyId;

  const companyItems: NavItem[] = cid
    ? [
        { href: `/companies/${cid}`, label: "Дашборд", icon: LayoutDashboard },
        { href: `/companies/${cid}/plan`, label: "Планувальник", icon: CalendarDays },
        { href: `/companies/${cid}/brief`, label: "Бренд", icon: SquarePen },
        { href: `/companies/${cid}/plan/settings`, label: "Розклад", icon: Settings2 },
      ]
    : [];

  const globalItems: NavItem[] = [{ href: "/inbox", label: "Задачі", icon: Inbox }];

  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r border-border bg-background md:flex">
      <div className="flex h-14 items-center gap-2 px-5">
        <Sparkles className="h-5 w-5 text-primary" />
        <span className="text-sm font-semibold tracking-tight">Forteq</span>
      </div>
      <nav className="flex flex-1 flex-col gap-1 px-3 py-2">
        {companyItems.map((item) => (
          <NavLink key={item.href} item={item} pathname={pathname} />
        ))}
        {companyItems.length > 0 && <div className="my-2 h-px bg-border" />}
        {globalItems.map((item) => (
          <NavLink key={item.href} item={item} pathname={pathname} />
        ))}
      </nav>
    </aside>
  );
}

function NavLink({ item, pathname }: { item: NavItem; pathname: string }) {
  const active = pathname === item.href;
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      className={cn(
        "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors",
        active
          ? "bg-accent text-accent-foreground"
          : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
      )}
    >
      <Icon className="h-4 w-4" />
      {item.label}
    </Link>
  );
}
