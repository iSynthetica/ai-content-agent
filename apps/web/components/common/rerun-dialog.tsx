"use client";

// Діалог перегенерації (spike-3 §10.1): опційна інструкція → feedback у POST .../decision {action:"rerun"}.
// Радіксового Dialog у проєкті немає (і CLI заборонено), тож — мінімальна доступна модалка на токенах:
// role="dialog" + aria-modal, закриття Esc/бекдропом, autoFocus на полі. Перевикористовується для run і item.
import * as React from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export function RerunDialog({
  open,
  onOpenChange,
  onConfirm,
  pending = false,
  title = "Перегенерувати",
  description,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (feedback?: string) => void;
  pending?: boolean;
  title?: string;
  description?: string;
}) {
  const [feedback, setFeedback] = React.useState("");

  // Скидаємо поле при кожному відкритті.
  React.useEffect(() => {
    if (open) setFeedback("");
  }, [open]);

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

        <div className="mt-4 space-y-2">
          <label htmlFor="rerun-feedback" className="text-sm font-medium">
            Інструкція (необовʼязково)
          </label>
          <Textarea
            id="rerun-feedback"
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            placeholder="Що саме змінити у наступній ітерації? Напр.: «прибрати заклики до дії, додати конкретику»."
            autoFocus
            disabled={pending}
          />
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Скасувати
          </Button>
          <Button onClick={() => onConfirm(feedback.trim() || undefined)} disabled={pending}>
            {pending ? "Відправляємо…" : "Перегенерувати"}
          </Button>
        </div>
      </div>
    </div>
  );
}
