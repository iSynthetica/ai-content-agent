"use client";

// Перемикач компанії (spike-3 §2.5, §5). Активна компанія — у path (`/companies/:companyId`),
// не в глобальному сторі. Вибір → навігація на дашборд обраної компанії.
import { useParams, useRouter } from "next/navigation";
import { Building2, Check, ChevronsUpDown } from "lucide-react";

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
import { useT } from "@/lib/i18n";
import { useCompanies, type Company } from "@/features/companies/use-companies";

export function CompanySwitcher({
  accountId,
  companies: initial,
}: {
  accountId: string;
  companies: Company[];
}) {
  const t = useT();
  const router = useRouter();
  const params = useParams<{ companyId?: string }>();
  const { data: companies = initial } = useCompanies(accountId, initial);
  const active = companies.find((c) => c.id === params.companyId) ?? companies[0];

  function select(id: string) {
    router.push(`/companies/${id}`);
  }

  if (!active) {
    return (
      <Button variant="ghost" size="sm" className="gap-2" onClick={() => router.push("/onboarding")}>
        <Building2 />
        {t("Створити компанію")}
      </Button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-2 font-medium">
          <Building2 className="opacity-70" />
          <span className="truncate">{active.name}</span>
          <ChevronsUpDown className="opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-60">
        <DropdownMenuLabel className="text-muted-foreground">{t("Компанія")}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {companies.map((c) => (
          <DropdownMenuItem key={c.id} onSelect={() => select(c.id)} className="gap-2">
            <span className="truncate">{c.name}</span>
            <Check className={cn("ml-auto", c.id === active.id ? "opacity-100" : "opacity-0")} />
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => router.push("/onboarding")} className="gap-2">
          <Building2 className="opacity-70" />
          {t("Нова компанія")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
