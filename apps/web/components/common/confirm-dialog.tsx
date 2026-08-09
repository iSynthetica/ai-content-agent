"use client";

// Діалог підтвердження незворотної дії (§post-archive hard-delete). Радіксового Dialog у проєкті
// немає (CLI заборонено), тож — та сама мінімальна доступна модалка на токенах, що й RerunDialog:
// role="dialog" + aria-modal, закриття Esc/бекдропом. На відміну від RerunDialog — без поля вводу,
// лише підтвердити/скасувати, а кнопка підтвердження за замовчуванням деструктивна.
import * as React from "react";

import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n";

export function ConfirmDialog({
  open,
  onOpenChange,
  onConfirm,
  pending = false,
  title,
  description,
  confirmLabel,
  destructive = true,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  pending?: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  destructive?: boolean;
}) {
  const t = useT();

  // Esc закриває (якщо не в процесі відправки).
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !pending) onOpenChange(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, pending, onOpenChange]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/50"
        aria-hidden
        onClick={() => !pending && onOpenChange(false)}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative z-10 w-full max-w-md rounded-lg border border-border bg-card p-6 text-card-foreground shadow-lg"
      >
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}

        <div className="mt-6 flex justify-end gap-3">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            {t("Скасувати")}
          </Button>
          <Button
            variant={destructive ? "destructive" : "default"}
            onClick={onConfirm}
            disabled={pending}
          >
            {pending ? t("Видаляємо…") : (confirmLabel ?? t("Підтвердити"))}
          </Button>
        </div>
      </div>
    </div>
  );
}
