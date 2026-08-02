"use client";

// Історія версій поста (§content-editing). Мінімальна доступна модалка на тих самих токенах, що й
// RerunDialog (role="dialog", Esc/бекдроп закривають); повторно не використовуємо RerunDialog
// напряму — тут інший контент (список, а не форма з одним полем).
import * as React from "react";
import { History, RotateCcw } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useItemVersions } from "@/features/content/use-item-versions";
import { useItemRevert } from "@/features/content/use-item-revert";
import { useT, useLanguage } from "@/lib/i18n";
import { formatDateTime } from "@/lib/format";
import { toast } from "sonner";

export function VersionHistoryDialog({
  open,
  onOpenChange,
  itemId,
  runId,
  canRevert,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  itemId: string;
  runId: string;
  canRevert: boolean;
}) {
  const t = useT();
  const { language } = useLanguage();
  const { data, isLoading } = useItemVersions(itemId, open);
  const revert = useItemRevert(runId);
  const [pendingId, setPendingId] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  if (!open) return null;

  function onRevert(versionId: string) {
    setPendingId(versionId);
    revert.mutate(
      { itemId, versionId },
      {
        onSuccess: () => {
          toast.success(t("Пост відновлено до обраної версії"));
          onOpenChange(false);
        },
        onError: () => toast.error(t("Не вдалося відновити версію")),
        onSettled: () => setPendingId(null),
      },
    );
  }

  const versions = data?.items ?? [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" aria-hidden onClick={() => onOpenChange(false)} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("Історія версій")}
        className="relative z-10 flex max-h-[80vh] w-full max-w-lg flex-col rounded-lg border border-border bg-card p-6 text-card-foreground shadow-lg"
      >
        <div className="flex items-center gap-2">
          <History className="h-4 w-4" aria-hidden />
          <h2 className="text-lg font-semibold tracking-tight">{t("Історія версій")}</h2>
        </div>

        <div className="mt-4 flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex flex-col gap-2">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : versions.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {t("Історія версій ще порожня.")}
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {versions.map((v, idx) => (
                <li key={v.id} className="rounded-md border border-border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Badge variant={v.source === "human" ? "info" : "muted"}>
                        {v.source === "human" ? t("Людська правка") : t("Згенеровано")}
                      </Badge>
                      {idx === 0 && (
                        <Badge variant="outline">{t("Поточна")}</Badge>
                      )}
                      <span className="text-xs text-muted-foreground">
                        {formatDateTime(v.createdAt, language)}
                      </span>
                    </div>
                    {canRevert && idx !== 0 && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={revert.isPending}
                        onClick={() => onRevert(v.id)}
                      >
                        <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                        {pendingId === v.id && revert.isPending
                          ? t("Відновлюємо…")
                          : t("Відновити цю версію")}
                      </Button>
                    )}
                  </div>
                  <p className="mt-2 line-clamp-3 whitespace-pre-wrap text-sm text-muted-foreground">
                    {v.title ? `${v.title} — ` : ""}
                    {v.text}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="mt-4 flex justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("Закрити")}
          </Button>
        </div>
      </div>
    </div>
  );
}
