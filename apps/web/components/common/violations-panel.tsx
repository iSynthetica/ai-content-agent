// ViolationsPanel (DS §6.2, §3) — порушення, знайдені Reviewer'ом у пості.
// «flagged» — ПОХІДНЕ від violations.length > 0 (НЕ статус, канон контракту), бейдж — FlaggedBadge.
//
// Кожне порушення прив'язане до тексту: quote — дослівний фрагмент поста, issue — суть проблеми.
// Показуємо саме цитату, бо рецензенту треба бачити ДЕ проблема, а не лише що вона є. Порушення
// без валідної цитати до UI не доходять — їх відкидає Reviewer (groundViolations).
import { CheckCircle2, ShieldAlert } from "lucide-react";

import { cn } from "@/lib/utils";

export interface Violation {
  quote: string;
  issue: string;
}

export function ViolationsPanel({
  violations,
  className,
}: {
  violations: Violation[] | null;
  className?: string;
}) {
  const list = violations ?? [];

  if (list.length === 0) {
    return (
      <p className={cn("inline-flex items-center gap-1.5 text-sm text-success", className)}>
        <CheckCircle2 className="h-4 w-4" aria-hidden />
        Порушень не виявлено
      </p>
    );
  }

  return (
    <ul className={cn("flex flex-col gap-2", className)}>
      {list.map((v, i) => (
        <li key={i} className="rounded-md border border-warning bg-background px-3 py-2 text-sm">
          <div className="flex items-start gap-2">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />
            <span className="font-medium">{v.issue}</span>
          </div>
          {v.quote && (
            <p className="mt-1 border-l-2 border-border pl-2 text-muted-foreground">«{v.quote}»</p>
          )}
        </li>
      ))}
    </ul>
  );
}
