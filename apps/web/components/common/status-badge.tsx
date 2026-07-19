// StatusBadge — композит поверх shadcn Badge. Кольори статусів беруться ВИКЛЮЧНО
// з lib/status.ts (єдина точка правди, DS §3). Компонент не знає доменної логіки —
// лише рендерить обчислений StatusVisual.
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  flaggedVisual,
  itemStatusVisual,
  planEntryStatusVisual,
  runStatusVisual,
  type ItemStatus,
  type PlanEntryStatus,
  type RunStatus,
  type StatusTone,
  type StatusVisual,
} from "@/lib/status";

// Outline-варіанти за тоном (proposed / flagged — outline у DS §3):
// прозорий фон + кольоровий бордер і текст замість суцільної заливки.
const OUTLINE_CLASSES: Record<StatusTone, string> = {
  muted: "border-border bg-transparent text-muted-foreground",
  info: "border-info bg-transparent text-info",
  success: "border-success bg-transparent text-success",
  warning: "border-warning bg-transparent text-warning",
  destructive: "border-destructive bg-transparent text-destructive",
};

function VisualBadge({ visual, className }: { visual: StatusVisual; className?: string }) {
  return (
    <Badge
      variant={visual.tone}
      className={cn(visual.outline && OUTLINE_CLASSES[visual.tone], className)}
    >
      {visual.pulse && (
        <span
          aria-hidden
          className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-current motion-safe:animate-pulse"
        />
      )}
      {visual.label}
    </Badge>
  );
}

// Дискримінований union: домен визначає, який мапінг зі status.ts застосувати.
type StatusBadgeProps =
  | { domain: "run"; status: RunStatus; className?: string }
  | { domain: "item"; status: ItemStatus; className?: string }
  | { domain: "planEntry"; status: PlanEntryStatus; className?: string };

export function StatusBadge(props: StatusBadgeProps) {
  const visual =
    props.domain === "run"
      ? runStatusVisual(props.status)
      : props.domain === "item"
        ? itemStatusVisual(props.status)
        : planEntryStatusVisual(props.status);

  return <VisualBadge visual={visual} className={props.className} />;
}

// «flagged» — похідне від violations.length > 0 (НЕ статус, DS §3).
export function FlaggedBadge({
  violationsCount,
  className,
}: {
  violationsCount: number;
  className?: string;
}) {
  const visual = flaggedVisual(violationsCount);
  if (!visual) return null;
  return <VisualBadge visual={visual} className={className} />;
}
