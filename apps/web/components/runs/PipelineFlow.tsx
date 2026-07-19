// PipelineFlow — n8n-подібна флоу-діаграма пайплайна генерації на сторінці run'у.
// Горизонтальний ряд нод-ролей зі стрілками-конекторами; на вузькому — вертикальний стек.
// Статус кожної ноди береться з run.progress (derivePipelineNodes). Кольори/motion — лише
// токени DS (§3 статуси, §5 motion). Домен-логіки не знає — рендерить обчислений вигляд.
import * as React from "react";
import { AlertTriangle, ArrowRight, Check, Circle, MinusCircle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { isRunTerminal } from "@/lib/status";
import type { RunDTO } from "@/features/runs/schemas";
import {
  derivePipelineNodes,
  currentRoleLabel,
  NODE_STATE_LABEL,
  type NodeState,
  type PipelineNodeView,
  type RunProgress,
} from "@/components/runs/pipeline";

// progress бек додає паралельно (ще не в runDTO). Розширюємо тип локально — RunDTO без
// progress лишається сумісним (поле опційне). TODO: прибрати, коли runProgress зайде у runDTO.
type RunWithProgress = RunDTO & { progress?: RunProgress | null };

// Вигляд картки-ноди за станом — суто токени DS §3 (semantic статуси).
const NODE_CARD_CLASS: Record<NodeState, string> = {
  pending: "border-border bg-card text-foreground",
  running: "border-info bg-info/5 text-foreground ring-1 ring-info/30",
  done: "border-success/50 bg-card text-foreground",
  skipped: "border-dashed border-border bg-card text-muted-foreground opacity-70",
  error: "border-destructive bg-destructive/5 text-foreground",
};

// Індикатор стану ноди (іконка/пульс). running = акцент + пульс (motion-safe:animate-pulse).
function NodeIndicator({ state }: { state: NodeState }) {
  switch (state) {
    case "running":
      return (
        <span
          aria-hidden
          className="inline-block h-2.5 w-2.5 rounded-full bg-info motion-safe:animate-pulse"
        />
      );
    case "done":
      return <Check aria-hidden className="h-4 w-4 text-success" />;
    case "skipped":
      return <MinusCircle aria-hidden className="h-4 w-4 text-muted-foreground" />;
    case "error":
      return <AlertTriangle aria-hidden className="h-4 w-4 text-destructive" />;
    case "pending":
    default:
      return <Circle aria-hidden className="h-4 w-4 text-muted-foreground/50" />;
  }
}

// Одна нода флоу — картка-бокс із роллю, статусом і (за потреби) бейджами.
function PipelineNode({ node }: { node: PipelineNodeView }) {
  return (
    <div
      className={cn(
        "flex w-full min-w-0 items-start gap-2.5 rounded-lg border p-3 transition-colors",
        "sm:w-auto sm:flex-1 sm:basis-36",
        NODE_CARD_CLASS[node.state],
      )}
    >
      <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center">
        <NodeIndicator state={node.state} />
      </span>
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-sm font-medium leading-none">{node.label}</span>
          {node.revision && (
            <Badge variant="muted" className="px-1.5 py-0 text-[10px] font-medium">
              ревізія
            </Badge>
          )}
        </div>
        <span className="text-xs text-muted-foreground">{NODE_STATE_LABEL[node.state]}</span>
        {node.conditional && (
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground/70">
            умовний
          </span>
        )}
      </div>
    </div>
  );
}

// Конектор між нодами (n8n-стиль). Вертикально на вузькому (стрілка вниз), горизонтально на sm+.
function Connector() {
  return (
    <span
      aria-hidden
      className="flex shrink-0 items-center justify-center self-center text-muted-foreground/50"
    >
      <ArrowRight className="h-4 w-4 rotate-90 sm:rotate-0" />
    </span>
  );
}

export function PipelineFlow({ run }: { run: RunWithProgress }) {
  const progress = run.progress ?? null;
  const nodes = derivePipelineNodes(progress, run.status);
  const terminal = isRunTerminal(run.status);
  const currentRole = currentRoleLabel(nodes);

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 py-5">
        {/* ── Верхній рядок: заголовок + «Зараз: <роль>» / «Завершено» ── */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-medium">Пайплайн</h2>
          {terminal ? (
            <span className="text-sm text-muted-foreground">Завершено</span>
          ) : currentRole ? (
            <span className="inline-flex items-center gap-2 text-sm">
              <span
                aria-hidden
                className="inline-block h-2 w-2 rounded-full bg-info motion-safe:animate-pulse"
              />
              <span className="text-muted-foreground">Зараз:</span>
              <span className="font-medium text-foreground">{currentRole}</span>
            </span>
          ) : (
            <span className="text-sm text-muted-foreground">Очікує на старт</span>
          )}
        </div>

        {/* ── Флоу нод зі стрілками-конекторами ── */}
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-stretch sm:gap-3">
          {nodes.map((node, i) => (
            <React.Fragment key={node.id}>
              <PipelineNode node={node} />
              {i < nodes.length - 1 && <Connector />}
            </React.Fragment>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
