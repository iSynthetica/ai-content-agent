"use client";

// Спільний список навігації (десктопний Sidebar + мобільний MobileNav використовують той самий).
// Компанійні лінки скоупляться companyId з path; ПОЗА компанійним роутом (напр. /inbox, /runs/:id)
// падаємо на першу компанію — інакше нав зникала й лишалась сама «Задачі». Це узгоджено з
// CompanySwitcher, який теж бере companies[0] як активну поза компанійним роутом.
import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import {
  CalendarDays,
  Inbox,
  LayoutDashboard,
  Settings2,
  Share2,
  SquarePen,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import type { Company } from "@/features/companies/use-companies";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

export function NavList({
  companies,
  onNavigate,
}: {
  companies: Company[];
  onNavigate?: () => void;
}) {
  const t = useT();
  const pathname = usePathname();
  const params = useParams<{ companyId?: string }>();
  const cid = params.companyId ?? companies[0]?.id;

  const companyItems: NavItem[] = cid
    ? [
        { href: `/companies/${cid}`, label: t("Дашборд"), icon: LayoutDashboard },
        { href: `/companies/${cid}/plan`, label: t("Планувальник"), icon: CalendarDays },
        { href: `/companies/${cid}/brief`, label: t("Бренд"), icon: SquarePen },
        { href: `/companies/${cid}/plan/settings`, label: t("Розклад"), icon: Settings2 },
      ]
    : [];

  const globalItems: NavItem[] = [
    { href: "/inbox", label: t("Задачі"), icon: Inbox },
    { href: "/members", label: t("Команда"), icon: Users },
    // §publishing: підключення соцмереж/Telegram. Сторінку бачить будь-який член; дії гейтяться всередині.
    { href: "/connections", label: t("Підключення"), icon: Share2 },
  ];

  return (
    <nav className="flex flex-1 flex-col gap-1 px-3 py-2">
      {companyItems.map((item) => (
        <NavLink key={item.href} item={item} pathname={pathname} onNavigate={onNavigate} />
      ))}
      {companyItems.length > 0 && <div className="my-2 h-px bg-border" />}
      {globalItems.map((item) => (
        <NavLink key={item.href} item={item} pathname={pathname} onNavigate={onNavigate} />
      ))}
    </nav>
  );
}

function NavLink({
  item,
  pathname,
  onNavigate,
}: {
  item: NavItem;
  pathname: string;
  onNavigate?: () => void;
}) {
  const active = pathname === item.href;
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
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
