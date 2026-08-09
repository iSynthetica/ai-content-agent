"use client";

// Список ранів компанії на дашборді (spike-3 §5, §9). RSC-знімок → useRuns бере кермо (polling
// поки є активні). Сітка RunCard; порожній/loading (Skeleton)/error стани (DS §7).
// §run-archive: перемикач архіву (окремий вигляд ?archived=only) + керування архівованими прогонами
// (розархів/видалення). Основний список за замовчуванням ховає архів (api дефолтить на exclude).
import * as React from "react";
import Link from "next/link";
import { Archive } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { RunCard } from "@/components/common/run-card";
import { GenerateButton } from "@/features/runs/GenerateButton";
import { ArchivedRunCard } from "@/features/runs/ArchivedRunCard";
import { useRuns } from "@/features/runs/use-runs";
import { useT } from "@/lib/i18n";
import type { RunDTO } from "@/features/runs/schemas";

export function RunsList({
  companyId,
  initialRuns,
  canArchive = false,
  canDelete = false,
}: {
  companyId: string;
  initialRuns: RunDTO[];
  // §run-archive: гейти дій над прогоном (run:start / run:delete) — рахуються на сторінці з ролі сесії.
  canArchive?: boolean;
  canDelete?: boolean;
}) {
  const t = useT();
  const { data: runs, isLoading, isError } = useRuns(companyId, initialRuns);

  // Окремий вигляд архіву: запит вмикається лише коли розділ відкрито (enabled), щоб не тягнути
  // архів на кожному завантаженні дашборда.
  const [showArchive, setShowArchive] = React.useState(false);
  const { data: archivedRuns } = useRuns(companyId, undefined, "only", showArchive);
  const archivedCount = archivedRuns?.length ?? 0;

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-medium tracking-tight">{t("Прогони генерації")}</h2>
          <p className="text-sm text-muted-foreground">
            {t("Запустіть генерацію та стежте за статусами прогонів у реальному часі.")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* §run-archive: перемикач вигляду архіву компанії. */}
          <Button
            type="button"
            variant={showArchive ? "secondary" : "outline"}
            size="sm"
            onClick={() => setShowArchive((v) => !v)}
            aria-pressed={showArchive}
          >
            <Archive className="h-4 w-4" />
            {t("Архів")}
            {archivedCount > 0 && (
              <span className="tabular-nums text-xs text-muted-foreground">{archivedCount}</span>
            )}
          </Button>
          <GenerateButton companyId={companyId} />
        </div>
      </div>

      {/* §run-archive: розділ архіву — розархів/видалення прогонів. */}
      {showArchive && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col gap-3 py-5">
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Archive className="h-4 w-4" aria-hidden />
              {t("Архівовані прогони")}
            </div>
            {archivedCount > 0 ? (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {(archivedRuns ?? []).map((run) => (
                  <ArchivedRunCard
                    key={run.id}
                    run={run}
                    companyId={companyId}
                    canArchive={canArchive}
                    canDelete={canDelete}
                  />
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">{t("В архіві поки що порожньо.")}</p>
            )}
          </CardContent>
        </Card>
      )}

      {isLoading && !runs ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-28 w-full" />
          ))}
        </div>
      ) : isError ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            {t("Не вдалося завантажити прогони. Спробуйте оновити сторінку.")}
          </CardContent>
        </Card>
      ) : !runs || runs.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("Ще немає прогонів")}</CardTitle>
            <CardDescription>
              {t("Перед першою генерацією заповніть бренд-профіль і налаштуйте контент-план — на них спираються агенти.")}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3">
            <Button asChild variant="outline">
              <Link href={`/companies/${companyId}/brief`}>{t("Заповнити бренд-профіль")}</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href={`/companies/${companyId}/plan`}>{t("Відкрити планувальник")}</Link>
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
