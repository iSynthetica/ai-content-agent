"use client";

// Деталь run (spike-3 §9, §10.2). Клієнтський оркестратор: useRun (єдиний polling-таймер) +
// useItems (рефетчиться реактивно від зміни run.counts.items/status, §9 п.6). HITL-банер на
// needs_review (Approve/Reject/Rerun по всьому run), стани generating/failed, ChannelTabs з картками.
import * as React from "react";
import Link from "next/link";
import { AlertTriangle, Archive, ArrowLeft, Loader2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/common/status-badge";
import { RerunDialog } from "@/components/common/rerun-dialog";
import { ChannelTabs } from "@/features/content/ChannelTabs";
import { PipelineFlow } from "@/components/runs/PipelineFlow";
import { GenerateButton } from "@/features/runs/GenerateButton";
import { useRun } from "@/features/runs/use-run";
import { useItems } from "@/features/content/use-items";
import { useRunDecision } from "@/features/runs/use-run-decision";
import { useConnections } from "@/features/connections/use-connections";
import { usePublications, usePublish } from "@/features/publishing/use-publications";
import type { PublicationDTO } from "@/lib/dto";
import { qk } from "@/lib/query-keys";
import { isRunGenerating, type RunStatus } from "@/lib/status";
import { ExportMenu } from "@/components/runs/ExportMenu";
import { formatCost, formatDateTime } from "@/lib/format";
import { useLanguage } from "@/lib/i18n";
import type { RunDTO } from "@/features/runs/schemas";
import type { ContentItemDTO } from "@/features/content/schemas";

export function RunDetail({
  runId,
  initialRun,
  initialItems,
  canEdit,
  canDelete,
  canPublish,
}: {
  runId: string;
  initialRun: RunDTO;
  initialItems: ContentItemDTO[];
  // §content-editing: гейт Edit/Revert на постах — рахує роль сесії з RSC-сторінки (той самий
  // патерн, що й ApiKeysManager.canManage), тож клієнтський дерево нижче лишається "тупим".
  canEdit: boolean;
  // §post-archive: гейт content:delete (кнопка «Видалити назавжди» в архіві) — рахується так само.
  canDelete: boolean;
  // §publishing: гейт кнопки «Опублікувати» — так само рахується на сторінці з ролі сесії.
  canPublish: boolean;
}) {
  const { t, language } = useLanguage();
  const qc = useQueryClient();
  const { data: run, isError } = useRun(runId, initialRun);
  const { data: items } = useItems(runId, initialItems);
  const runDecision = useRunDecision(runId, initialRun.companyId);
  const [rerunOpen, setRerunOpen] = React.useState(false);

  // §post-archive: окремий вигляд архіву прогону. Запит на архів вмикається лише коли вкладку
  // відкрито (enabled=showArchive), щоб не тягнути архів на кожному завантаженні сторінки.
  const [showArchive, setShowArchive] = React.useState(false);
  const { data: archivedItems } = useItems(runId, undefined, "only", showArchive);
  const archivedCount = archivedItems?.length ?? 0;

  // §publishing: connection'и (щоб знати, куди можна публікувати) + стан публікацій по прогону
  // (окремий полл — результат фонової джоби доїжджає ПІСЛЯ дії). publish триґерить enqueue.
  const { data: connections } = useConnections();
  const publications = usePublications(runId);
  const publish = usePublish(runId);

  const connectedProviders = React.useMemo(
    () =>
      new Set(
        (connections?.items ?? [])
          .filter((c) => c.status === "connected")
          .map((c) => c.provider),
      ),
    [connections],
  );
  // Останній стан публікації на айтем (беремо найсвіжіший рядок, якщо їх кілька).
  const publicationByItem = React.useMemo(() => {
    const map = new Map<string, PublicationDTO>();
    for (const p of publications.data ?? []) {
      const prevP = map.get(p.contentItemId);
      if (!prevP || p.createdAt > prevP.createdAt) map.set(p.contentItemId, p);
    }
    return map;
  }, [publications.data]);

  const itemsCount = run?.counts?.items;
  const status = run?.status;

  // Єдиний механізм появи карток (§9 п.6): коли зростає лічильник або змінюється статус —
  // інвалідуємо айтеми (їх поллить не окремий таймер, а цей реактивний тригер). Ref не дає
  // зайвого рефетчу на першому рендері (знімок RSC уже свіжий).
  const prev = React.useRef<{ count?: number; status?: RunStatus }>({ count: itemsCount, status });
  React.useEffect(() => {
    if (prev.current.count !== itemsCount || prev.current.status !== status) {
      prev.current = { count: itemsCount, status };
      qc.invalidateQueries({ queryKey: qk.items(runId) });
    }
  }, [itemsCount, status, runId, qc]);

  if (!run) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  const companyId = run.companyId;
  const generating = isRunGenerating(run.status);
  const decisionPending = runDecision.isPending;

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      {/* ── Шапка ── */}
      <header className="flex flex-col gap-3">
        <Link
          href={`/companies/${companyId}`}
          className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          {t("До компанії")}
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h1 className="font-mono text-xl font-semibold tracking-tight">
              {t("Прогін")} {run.id.slice(0, 8)}
            </h1>
            <p className="text-sm text-muted-foreground">
              {formatDateTime(run.createdAt, language)} · {formatCost(run.costCents)}
              {run.counts ? ` · ${t("постів")}: ${run.counts.items}` : ""}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* §post-archive: перемикач архіву прогону (керування архівованими постами). */}
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
            {/* Поки граф працює, постів ще немає — вивантажувати нічого. */}
            <ExportMenu runId={run.id} disabled={generating} />
            <StatusBadge domain="run" status={run.status} />
          </div>
        </div>
        {run.runConfig && (
          <p className="text-xs text-muted-foreground">
            {t("Конфігурація")}:{" "}
            {Object.keys(run.runConfig.counts).length > 0
              ? Object.entries(run.runConfig.counts)
                  .map(([c, n]) => `${c} ×${n}`)
                  .join(", ")
              : t("з календаря (обрані слоти)")}
            {run.runConfig.angle ? ` · ${t("акцент")}: ${run.runConfig.angle}` : ""}
            {run.runConfig.agentModels && Object.keys(run.runConfig.agentModels).length
              ? ` · ${t("моделі")}: ${Object.entries(run.runConfig.agentModels)
                  .map(([r, m]) => `${r}:${m.provider}/${m.model}`)
                  .join(", ")}`
              : ""}
          </p>
        )}
      </header>

      {/* ── Стан: генерується ── */}
      {generating && (
        <Card>
          <CardContent className="flex items-center gap-3 py-5 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            {run.status === "queued"
              ? t("У черзі на генерацію…")
              : t("Агенти працюють над контентом. Картки з'являтимуться поступово.")}
          </CardContent>
        </Card>
      )}

      {/* ── Стан: помилка прогону ── */}
      {run.status === "failed" && (
        <Card className="border-destructive">
          <CardContent className="flex flex-col gap-3 py-5">
            <div className="flex items-center gap-2 text-sm font-medium text-destructive">
              <AlertTriangle className="h-4 w-4" aria-hidden />
              {t("Прогін завершився помилкою")}
            </div>
            <p className="text-sm text-muted-foreground">
              {t("Можна повторити генерацію з тими самими налаштуваннями компанії.")}
            </p>
            <GenerateButton companyId={companyId} className="w-fit" />
          </CardContent>
        </Card>
      )}

      {/* ── HITL-банер: потрібне рішення по всьому run ── */}
      {run.status === "needs_review" && (
        <Card className="border-warning">
          <CardContent className="flex flex-col gap-3 py-5">
            <div className="flex items-center gap-2 text-sm font-medium text-warning">
              <AlertTriangle className="h-4 w-4" aria-hidden />
              {t("Прогін очікує на ваше рішення")}
            </div>
            <p className="text-sm text-muted-foreground">
              {run.counts
                ? `${t("Постів")}: ${run.counts.items}. ${t("Потребують уваги")}: ${run.counts.needsReview}.`
                : t("Перегляньте пости нижче й ухваліть рішення по всьому прогону.")}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                onClick={() => runDecision.mutate({ action: "approve" })}
                disabled={decisionPending}
              >
                {t("Схвалити прогін")}
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => runDecision.mutate({ action: "reject" })}
                disabled={decisionPending}
              >
                {t("Відхилити прогін")}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setRerunOpen(true)}
                disabled={decisionPending}
              >
                {t("Перегенерувати")}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Помилка завантаження run ── */}
      {isError && (
        <Card>
          <CardContent className="py-6 text-center text-sm text-muted-foreground">
            {t("Не вдалося оновити статус прогону. Дані можуть бути неактуальними.")}
          </CardContent>
        </Card>
      )}

      {/* ── Флоу пайплайна: ролі-ноди й хто зараз виконується (над картками статей) ── */}
      <PipelineFlow run={run} />

      {/* ── Архів прогону (§post-archive): керування архівованими постами ── */}
      {showArchive && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col gap-4 py-5">
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Archive className="h-4 w-4" aria-hidden />
              {t("Архівовані пости")}
            </div>
            {archivedCount > 0 ? (
              <ChannelTabs
                items={archivedItems ?? []}
                runId={runId}
                companyId={companyId}
                canEdit={canEdit}
                canDelete={canDelete}
                canPublish={canPublish}
                connectedProviders={connectedProviders}
                publicationByItem={publicationByItem}
                onPublish={(itemId) => publish.mutate([itemId])}
                publishPending={publish.isPending}
              />
            ) : (
              <p className="text-sm text-muted-foreground">{t("В архіві поки що порожньо.")}</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Пости за каналами ── */}
      {items && items.length > 0 ? (
        <ChannelTabs
          items={items}
          runId={runId}
          companyId={companyId}
          canEdit={canEdit}
          canDelete={canDelete}
          canPublish={canPublish}
          connectedProviders={connectedProviders}
          publicationByItem={publicationByItem}
          onPublish={(itemId) => publish.mutate([itemId])}
          publishPending={publish.isPending}
        />
      ) : !generating ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            {t("У цьому прогоні ще немає постів.")}
          </CardContent>
        </Card>
      ) : null}

      <RerunDialog
        open={rerunOpen}
        onOpenChange={setRerunOpen}
        pending={decisionPending}
        title={t("Перегенерувати прогін")}
        description={t("Прогін піде на нову ітерацію. Можна додати спільну інструкцію для агентів.")}
        onConfirm={(feedback) =>
          runDecision.mutate(
            { action: "rerun", feedback },
            { onSuccess: () => setRerunOpen(false) },
          )
        }
      />
    </div>
  );
}
