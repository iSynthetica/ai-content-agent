// Планувальник (§2.11, S-19) — слоти контент-плану по днях і каналах.
// Список клієнтський: слоти наповнюються темами ФОНОВОЮ job'ою, тож сторінка має оновлюватись
// сама, інакше теми доїдуть у базу, а користувач їх не побачить без перезавантаження.
import Link from "next/link";
import { Settings2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { PlannerBoard } from "@/features/planner/PlannerBoard";

export default async function PlanPage({
  params,
}: {
  params: Promise<{ companyId: string }>;
}) {
  const { companyId } = await params;

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Планувальник</h1>
          <p className="text-muted-foreground">
            Спершу слоти й теми, потім генерація — план можна переглянути до того, як витрачені
            гроші на модель.
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href={`/companies/${companyId}/plan/settings`}>
            <Settings2 />
            Розклад
          </Link>
        </Button>
      </header>

      <PlannerBoard companyId={companyId} />
    </div>
  );
}
