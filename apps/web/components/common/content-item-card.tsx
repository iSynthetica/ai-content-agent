"use client";

// ContentItemCard (DS §6.2, spike-3 §10.1) — картка поста: текст (+ copy), канал+topic,
// StatusBadge (item_status) + FlaggedBadge (похідне violations>0), ScoreMeter (4 критерії з why),
// ViolationsPanel, для instagram — прев'ю imageUrl. Дії: Approve / Reject / Re-run (той самий
// канонічний ендпойнт .../decision; rerun → діалог з feedback). Optimistic — у useItemDecision.
import * as React from "react";
import { Check, Copy, ImageIcon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ChannelBadge } from "@/components/common/channel-badge";
import { PostBody } from "@/components/common/post-body";
import { RerunDialog } from "@/components/common/rerun-dialog";
import { ScoreMeter } from "@/components/common/score-meter";
import { StatusBadge, FlaggedBadge } from "@/components/common/status-badge";
import { ViolationsPanel } from "@/components/common/violations-panel";
import { useItemDecision } from "@/features/content/use-item-decision";
import type { ContentItemDTO } from "@/features/content/schemas";

export function ContentItemCard({
  item,
  runId,
  companyId,
}: {
  item: ContentItemDTO;
  runId: string;
  companyId: string;
}) {
  const decision = useItemDecision(runId, companyId);
  const [rerunOpen, setRerunOpen] = React.useState(false);
  const [copied, setCopied] = React.useState(false);

  const violationsCount = item.violations?.length ?? 0;

  async function onCopy() {
    if (!item.text) return;
    try {
      await navigator.clipboard.writeText(item.text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Не вдалося скопіювати");
    }
  }

  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-2 space-y-0">
        <div className="flex flex-wrap items-center gap-2">
          <ChannelBadge channel={item.channel} />
          <StatusBadge domain="item" status={item.status} />
          <FlaggedBadge violationsCount={violationsCount} />
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onCopy}
          disabled={!item.text}
          aria-label="Скопіювати текст"
        >
          {copied ? <Check className="text-success" /> : <Copy />}
          {copied ? "Скопійовано" : "Копіювати"}
        </Button>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        {item.topic && <p className="text-sm font-medium">{item.topic}</p>}

        {/* Прев'ю зображення — лише instagram (FR-9.4); lazy-load, без падіння якщо ще немає. */}
        {item.channel === "instagram" &&
          (item.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={item.imageUrl}
              alt={item.topic ?? "Згенероване зображення"}
              loading="lazy"
              className="max-h-96 w-full rounded-md border border-border object-cover"
            />
          ) : (
            // Картинки малюються ПІСЛЯ того, як текст уже доступний для рецензії (§7.4), тож
            // порожній слот — очікуваний тимчасовий стан, а не помилка. Показуємо це явно,
            // інакше виглядає, ніби зображення просто немає.
            <div className="flex h-40 w-full items-center justify-center rounded-md border border-dashed border-border bg-muted/30">
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <ImageIcon className="size-4 animate-pulse" />
                Зображення генерується…
              </p>
            </div>
          ))}

        {item.text ? (
          <PostBody text={item.text} channel={item.channel} />
        ) : (
          <p className="text-sm italic text-muted-foreground">Текст ще генерується…</p>
        )}

        <Separator />

        <div className="flex flex-col gap-3">
          <h4 className="text-sm font-medium">Оцінки Reviewer’а</h4>
          <ScoreMeter scores={item.scores} />
        </div>

        <div className="flex flex-col gap-2">
          <h4 className="text-sm font-medium">Порушення</h4>
          <ViolationsPanel violations={item.violations} />
        </div>
      </CardContent>

      <div className="flex flex-wrap items-center gap-2 border-t border-border p-4">
        <Button
          size="sm"
          onClick={() => decision.mutate({ itemId: item.id, action: "approve" })}
          disabled={decision.isPending || item.status === "approved"}
        >
          Схвалити
        </Button>
        <Button
          size="sm"
          variant="destructive"
          onClick={() => decision.mutate({ itemId: item.id, action: "reject" })}
          disabled={decision.isPending || item.status === "rejected"}
        >
          Відхилити
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setRerunOpen(true)}
          disabled={decision.isPending}
        >
          Перегенерувати
        </Button>
      </div>

      <RerunDialog
        open={rerunOpen}
        onOpenChange={setRerunOpen}
        pending={decision.isPending}
        title="Перегенерувати пост"
        description="Пост піде на нову ітерацію (needs_revision). Можна додати інструкцію для Writer'а."
        onConfirm={(feedback) =>
          decision.mutate(
            { itemId: item.id, action: "rerun", feedback },
            { onSuccess: () => setRerunOpen(false) },
          )
        }
      />
    </Card>
  );
}
