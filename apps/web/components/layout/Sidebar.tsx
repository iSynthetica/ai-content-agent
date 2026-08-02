// Ліва навігація AppShell (DS §7). Стримано, hairline-бордер справа. Ховається під md — там нав
// відкривається через MobileNav (гамбургер у Topbar). Пункти й скоуп — у спільному NavList.
import { Sparkles } from "lucide-react";

import { NavList } from "@/components/layout/NavList";
import type { Company } from "@/features/companies/use-companies";

export function Sidebar({ companies }: { companies: Company[] }) {
  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r border-border bg-background md:flex">
      <div className="flex h-14 items-center gap-2 px-5">
        <Sparkles className="h-5 w-5 text-primary" />
        <span className="text-sm font-semibold tracking-tight">Forteq</span>
      </div>
      <NavList companies={companies} />
    </aside>
  );
}
