"use client";

// §run-archive: архівований прогін у списку компанії — RunCard (клік → деталь) + рядок керування:
// Розархівувати (run:start) та Видалити назавжди (run:delete, через ConfirmDialog). Мутації живуть
// у useRunArchive; runId передається як змінна мутації.
import * as React from "react";
import { ArchiveRestore, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { RunCard } from "@/components/common/run-card";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { useRunArchive } from "@/features/runs/use-run-archive";
import { useT } from "@/lib/i18n";
import type { RunDTO } from "@/features/runs/schemas";

export function ArchivedRunCard({
  run,
  companyId,
  canArchive,
  canDelete,
}: {
  run: RunDTO;
  companyId: string;
  canArchive: boolean;
  canDelete: boolean;
}) {
  const t = useT();
  const runArchive = useRunArchive(companyId);
  const [deleteOpen, setDeleteOpen] = React.useState(false);

  return (
    <div className="flex flex-col gap-2 opacity-80">
      <RunCard run={run} />
      <div className="flex flex-wrap items-center gap-1">
        {canArchive && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() =>
              runArchive.unarchive.mutate(run.id, {
                onSuccess: () => toast.success(t("Прогін відновлено з архіву")),
                onError: () => toast.error(t("Не вдалося відновити прогін")),
              })
            }
            disabled={runArchive.unarchive.isPending}
          >
            <ArchiveRestore />
            {t("Розархівувати")}
          </Button>
        )}
        {canDelete && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-destructive hover:text-destructive"
            onClick={() => setDeleteOpen(true)}
            disabled={runArchive.remove.isPending}
          >
            <Trash2 />
            {t("Видалити назавжди")}
          </Button>
        )}
      </div>

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        pending={runArchive.remove.isPending}
        title={t("Видалити прогін назавжди?")}
        description={t("Прогін разом з усіма постами, історією версій та публікаціями буде видалено безповоротно. Цю дію не можна скасувати.")}
        confirmLabel={t("Видалити назавжди")}
        onConfirm={() =>
          runArchive.remove.mutate(run.id, {
            onSuccess: () => {
              toast.success(t("Прогін видалено назавжди"));
              setDeleteOpen(false);
            },
            onError: () => toast.error(t("Не вдалося видалити прогін")),
          })
        }
      />
    </div>
  );
}
