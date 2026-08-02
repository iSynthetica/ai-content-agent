"use client";

// Верхня панель AppShell (DS §7): перемикачі акаунта/компанії зліва; дзвіночок + user-menu справа.
// Дзвіночок — NotificationBell (§2.13): бейдж рахує actionable-задачі Inbox, не всі сповіщення.
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

import { Button } from "@/components/ui/button";
import { MobileNav } from "@/components/layout/MobileNav";
import { NotificationBell } from "@/components/layout/NotificationBell";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AccountSwitcher } from "@/features/accounts/AccountSwitcher";
import { CompanySwitcher } from "@/features/companies/CompanySwitcher";
import { SESSION_COOKIE } from "@/lib/auth-constants";
import type { AccountDTO } from "@/lib/dto";
import type { Company } from "@/features/companies/use-companies";
import type { Session } from "@/server/auth";

const MOCK = process.env.NEXT_PUBLIC_MOCK_API === "1";

function initials(name: string | null, email: string): string {
  const src = name?.trim() || email;
  return src.slice(0, 2).toUpperCase();
}

export function Topbar({
  session,
  accounts,
  companies,
  activeAccountId,
}: {
  session: Session;
  accounts: AccountDTO[];
  companies: Company[];
  activeAccountId: string;
}) {
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();
  // Іконку теми рендеримо лише після монтування — інакше SSR/CSR-розбіжність (resolvedTheme
  // невідома на сервері). До монтування показуємо стабільний плейсхолдер (Moon).
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const isDark = mounted && resolvedTheme === "dark";

  async function handleSignOut() {
    if (MOCK) {
      // Без api: гасимо сесійний cookie локально й ведемо на /login.
      document.cookie = `${SESSION_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
    } else {
      // Прямий fetch → BFF → api /v1/auth/sign-out: гасить сесію + Set-Cookie passthrough.
      await fetch("/api/auth/sign-out", { method: "POST", credentials: "include" });
    }
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="flex h-14 items-center gap-2 border-b border-border bg-background px-4">
      <div className="flex items-center gap-1">
        <MobileNav companies={companies} />
        <AccountSwitcher accounts={accounts} activeAccountId={activeAccountId} />
        <span className="text-muted-foreground">/</span>
        <CompanySwitcher accountId={activeAccountId} companies={companies} />
      </div>

      <div className="ml-auto flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Перемкнути тему"
          onClick={() => setTheme(isDark ? "light" : "dark")}
        >
          {isDark ? <Sun /> : <Moon />}
        </Button>

        <NotificationBell />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Меню користувача">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-xs font-medium text-primary-foreground">
                {initials(session.user.name, session.user.email)}
              </span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="flex flex-col gap-0.5">
              <span className="text-sm font-medium">{session.user.name ?? "Користувач"}</span>
              <span className="text-xs font-normal text-muted-foreground">{session.user.email}</span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={handleSignOut} className="gap-2">
              <LogOut className="h-4 w-4" />
              Вийти
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
