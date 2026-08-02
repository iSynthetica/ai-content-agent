"use client";

// RunCard (DS §6.2) — картка прогону у списку/сітці ранів. Клік → деталь /runs/:id.
// StatusBadge (run_status), час створення, вартість (costCents), counts якщо є. Тримається
// на border (DS §5); домен-логіки не знає — лише рендерить RunDTO.
import Link from "next/link";

import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/common/status-badge";
import { formatDateTime, formatCost } from "@/lib/format";
import { useLanguage } from "@/lib/i18n";
import type { RunDTO } from "@/features/runs/schemas";

export function RunCard({ run }: { run: RunDTO }) {
  const { t, language } = useLanguage();
  return (
    <Link
      href={`/runs/${run.id}`}
      className="block rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
    >
      <Card className="flex h-full flex-col gap-3 p-4 hover:border-primary/40">
        <div className="flex items-center justify-between gap-2">
          <StatusBadge domain="run" status={run.status} />
          <span className="text-sm font-medium tabular-nums text-muted-foreground">
            {formatCost(run.costCents)}
          </span>
        </div>

        <div className="text-sm text-muted-foreground">{formatDateTime(run.createdAt, language)}</div>

        {run.counts && (
          <div className="mt-auto flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span>
              {t("Постів")}: <span className="font-medium text-foreground">{run.counts.items}</span>
            </span>
            {run.counts.needsReview > 0 && (
              <span className="text-warning">{t("На рецензії")}: {run.counts.needsReview}</span>
            )}
          </div>
        )}
      </Card>
    </Link>
  );
}
