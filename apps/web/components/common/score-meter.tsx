// ScoreMeter / ScoresPanel (DS §6.2) — 4 критерії Reviewer'а (1–5), компактні смужки.
// Колір за значенням (семантичні токени DS §2): ≥4 success, 3 warning, <3 destructive.
// Кожен рядок має tooltip з `why` (FR-6.2). Web НЕ інтерпретує scores — лише рендерить.
import { Info } from "lucide-react";

import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { ContentItemDTO } from "@/features/content/schemas";

// scores з контракту: Record<критерій, { score, why }> | null (criterionScore у contentItemDTO).
type Scores = ContentItemDTO["scores"];

// Людські лейбли відомих критеріїв; невідомий ключ показуємо як є (без падіння).
const CRITERION_LABELS: Record<string, string> = {
  tone: "Тон",
  specificity: "Конкретність",
  factual: "Фактичність",
  channel_fit: "Відповідність каналу",
};

const MAX_SCORE = 5;

function toneClass(score: number): string {
  if (score >= 4) return "bg-success";
  if (score === 3) return "bg-warning";
  return "bg-destructive";
}

export function ScoreMeter({ scores, className }: { scores: Scores; className?: string }) {
  const entries = scores ? Object.entries(scores) : [];
  if (entries.length === 0) {
    return <p className="text-xs text-muted-foreground">Оцінок ще немає.</p>;
  }

  return (
    <ul className={cn("flex flex-col gap-2", className)}>
      {entries.map(([key, { score, why }]) => (
        <li key={key} className="flex items-center gap-3 text-sm">
          <span className="w-40 shrink-0 text-muted-foreground">
            {CRITERION_LABELS[key] ?? key}
          </span>
          <span className="flex flex-1 items-center gap-1" aria-hidden>
            {Array.from({ length: MAX_SCORE }, (_, i) => (
              <span
                key={i}
                className={cn(
                  "h-1.5 flex-1 rounded-full",
                  i < score ? toneClass(score) : "bg-muted",
                )}
              />
            ))}
          </span>
          <span className="w-8 shrink-0 text-right tabular-nums font-medium">
            {score}
            <span className="text-muted-foreground">/{MAX_SCORE}</span>
          </span>
          <Tooltip content={why}>
            <button
              type="button"
              aria-label={`Чому: ${CRITERION_LABELS[key] ?? key}`}
              className="text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:text-foreground"
            >
              <Info className="h-3.5 w-3.5" />
            </button>
          </Tooltip>
        </li>
      ))}
    </ul>
  );
}
