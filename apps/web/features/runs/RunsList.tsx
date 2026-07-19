"use client";

// Список ранів компанії на дашборді (spike-3 §5, §9). RSC-знімок → useRuns бере кермо (polling
// поки є активні). Сітка RunCard; порожній/loading (Skeleton)/error стани (DS §7).
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { RunCard } from "@/components/common/run-card";
import { GenerateButton } from "@/features/runs/GenerateButton";
import { useRuns } from "@/features/runs/use-runs";
import type { RunDTO } from "@/features/runs/schemas";

export function RunsList({
  companyId,
  initialRuns,
}: {
  companyId: string;
  initialRuns: RunDTO[];
}) {
  const { data: runs, isLoading, isError } = useRuns(companyId, initialRuns);

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-medium tracking-tight">Прогони генерації</h2>
          <p className="text-sm text-muted-foreground">
            Запустіть генерацію та стежте за статусами прогонів у реальному часі.
          </p>
        </div>
        <GenerateButton companyId={companyId} />
      </div>

      {isLoading && !runs ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-28 w-full" />
          ))}
        </div>
      ) : isError ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            Не вдалося завантажити прогони. Спробуйте оновити сторінку.
          </CardContent>
        </Card>
      ) : !runs || runs.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Ще немає прогонів</CardTitle>
            <CardDescription>
              Перед першою генерацією заповніть бренд-профіль і налаштуйте контент-план — на них
              спираються агенти.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3">
            <Button asChild variant="outline">
              <Link href={`/companies/${companyId}/brief`}>Заповнити бренд-профіль</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href={`/companies/${companyId}/plan`}>Відкрити планувальник</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {runs.map((run) => (
            <RunCard key={run.id} run={run} />
          ))}
        </div>
      )}
    </section>
  );
}
