// AppShell (DS §6.2/§7): Sidebar-нав + Topbar (перемикачі, bell, user menu) + контентна зона.
// Серверний компонент — приймає RSC-знімки (session/accounts/companies) і роздає їх клієнтським
// підкомпонентам як initialData (spike-3 §8.5), без клієнтського waterfall на першому екрані.
import type { ReactNode } from "react";

import { Sidebar } from "@/components/layout/Sidebar";
import { Topbar } from "@/components/layout/Topbar";
import type { AccountDTO } from "@/lib/dto";
import type { Company } from "@/features/companies/use-companies";
import type { Session } from "@/server/auth";

export function AppShell({
  session,
  accounts,
  companies,
  activeAccountId,
  children,
}: {
  session: Session;
  accounts: AccountDTO[];
  companies: Company[];
  activeAccountId: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar companies={companies} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          session={session}
          accounts={accounts}
          companies={companies}
          activeAccountId={activeAccountId}
        />
        <main className="flex-1 overflow-x-auto p-6">{children}</main>
      </div>
    </div>
  );
}
