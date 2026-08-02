"use client";

// Перемикач акаунта (spike-3 §2.5, §5). При виборі: пише cookie activeAccountId (UI-контекст,
// не транспорт авторизації) і веде на дефолтну компанію обраного акаунта (через індекс `/`).
// Тенант-скоуп api виводить із сесії + RLS, а не з cookie.
import { useRouter } from "next/navigation";
import { Check, ChevronsUpDown, KeyRound } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { setActiveAccountCookie } from "@/lib/active-account";
import { useAccounts } from "@/features/accounts/use-accounts";
import type { AccountDTO } from "@/lib/dto";

export function AccountSwitcher({
  accounts: initial,
  activeAccountId,
}: {
  accounts: AccountDTO[];
  activeAccountId: string;
}) {
  const router = useRouter();
  const { data: accounts = initial } = useAccounts(initial);
  const active = accounts.find((a) => a.id === activeAccountId) ?? accounts[0];

  function select(id: string) {
    if (id === activeAccountId) return;
    setActiveAccountCookie(id);
    // Індекс `/` перечитає cookie й поведе на дефолтну компанію обраного акаунта.
    router.push("/");
    router.refresh();
  }

  if (!active) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-2 font-medium">
          <span className="truncate">{active.name}</span>
          <ChevronsUpDown className="opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel className="text-muted-foreground">Акаунт</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {accounts.map((a) => (
          <DropdownMenuItem key={a.id} onSelect={() => select(a.id)} className="gap-2">
            <span className="truncate">{a.name}</span>
            <Check className={cn("ml-auto", a.id === active.id ? "opacity-100" : "opacity-0")} />
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => router.push("/settings")} className="gap-2">
          <KeyRound className="opacity-70" />
          <span>Ключі API</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
