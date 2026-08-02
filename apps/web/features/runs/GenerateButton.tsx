"use client";

// Generate-кнопка (§spec 08): натискання БІЛЬШЕ НЕ запускає прогін — воно відкриває конфігуратор
// (RunConfigDialog). Прогін стартує лише після явного підтвердження в діалозі. Помилки (напр. 422
// «немає ключа») показує сам діалог + глобальний mutationCache.onError (toast).
import { useState } from "react";
import { Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { RunConfigDialog } from "@/features/runs/RunConfigDialog";
import { useT } from "@/lib/i18n";

export function GenerateButton({
  companyId,
  planEntryIds,
  className,
}: {
  companyId: string;
  planEntryIds?: string[];
  className?: string;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button onClick={() => setOpen(true)} className={className}>
        <Sparkles />
        {t("Згенерувати")}
      </Button>
      {open && (
        <RunConfigDialog
          companyId={companyId}
          planEntryIds={planEntryIds}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
