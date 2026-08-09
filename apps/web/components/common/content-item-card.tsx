"use client";

// ContentItemCard (DS §6.2, spike-3 §10.1) — картка поста: текст (+ copy), канал+topic,
// StatusBadge (item_status) + FlaggedBadge (похідне violations>0), ScoreMeter (4 критерії з why),
// ViolationsPanel, для instagram — прев'ю imageUrl. Дії: Approve / Reject / Re-run (той самий
// канонічний ендпойнт .../decision; rerun → діалог з feedback). Optimistic — у useItemDecision.
//
// §content-editing: Edit (inline textarea, гейт по content:edit) + History (доступно всім членам
// акаунта — read без RBAC-гварда, revert усередині діалогу так само гейтиться canEdit).
import * as React from "react";
import { Archive, ArchiveRestore, AlertTriangle, Check, Copy, ExternalLink, History, ImageIcon, Loader2, Pencil, Send, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { CONNECTION_PROVIDER_LABELS, PUBLISH_PROVIDERS, type ConnectionProvider } from "@forteq/shared";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { ChannelBadge } from "@/components/common/channel-badge";
import { PostBody } from "@/components/common/post-body";
import { RerunDialog } from "@/components/common/rerun-dialog";
import { ScoreMeter } from "@/components/common/score-meter";
import { StatusBadge, FlaggedBadge } from "@/components/common/status-badge";
import { ViolationsPanel } from "@/components/common/violations-panel";
import { VersionHistoryDialog } from "@/components/common/version-history-dialog";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { useItemDecision } from "@/features/content/use-item-decision";
import { useItemEdit } from "@/features/content/use-item-edit";
import { useItemArchive } from "@/features/content/use-item-archive";
import { useT } from "@/lib/i18n";
import type { ContentItemDTO } from "@/features/content/schemas";
import type { PublicationDTO } from "@/lib/dto";

export function ContentItemCard({
  item,
  runId,
  companyId,
  canEdit,
  canDelete = false,
  canPublish = false,
  providerConnected = false,
  publication = null,
  onPublish,
  publishPending = false,
}: {
  item: ContentItemDTO;
  runId: string;
  companyId: string;
  // §content-editing: гейт по content:edit (сесія-рівень, читається на сторінці run). Без цього
  // прапорця кнопки Edit/Revert не рендерились би взагалі — бек все одно відхилив би 403, але
  // показувати недоступну дію — гірший UX, ніж її ховати (той самий підхід, що й ApiKeysManager).
  canEdit: boolean;
  // §post-archive: гейт content:delete (owner/admin) — керує кнопкою «Видалити назавжди» для
  // архівованих постів. Архів/розархів гейтяться тим самим canEdit (оборотні дії).
  canDelete?: boolean;
  // §publishing: гейт publish:manage + контекст публікації айтема (стан + чи підключений провайдер).
  // Опційні: картку рендерять і поза run-детеллю (напр. прев'ю), де публікації немає.
  canPublish?: boolean;
  providerConnected?: boolean;
  publication?: PublicationDTO | null;
  onPublish?: (itemId: string) => void;
  publishPending?: boolean;
}) {
  const t = useT();
  const decision = useItemDecision(runId, companyId);
  const edit = useItemEdit(runId);
  const archiveOps = useItemArchive(runId, companyId);
  const [rerunOpen, setRerunOpen] = React.useState(false);
  const [historyOpen, setHistoryOpen] = React.useState(false);
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [editing, setEditing] = React.useState(false);
  const [draftText, setDraftText] = React.useState(item.text ?? "");
  const [draftTitle, setDraftTitle] = React.useState(item.title ?? "");
  const [copied, setCopied] = React.useState(false);

  const violationsCount = item.violations?.length ?? 0;
  const isArchived = Boolean(item.archivedAt);

  function onArchive() {
    archiveOps.archive.mutate(item.id, {
      onSuccess: () => toast.success(t("Пост заархівовано")),
      onError: () => toast.error(t("Не вдалося заархівувати пост")),
    });
  }

  function onUnarchive() {
    archiveOps.unarchive.mutate(item.id, {
      onSuccess: () => toast.success(t("Пост відновлено з архіву")),
      onError: () => toast.error(t("Не вдалося відновити пост")),
    });
  }

  function onDelete() {
    archiveOps.remove.mutate(item.id, {
      onSuccess: () => {
        toast.success(t("Пост видалено назавжди"));
        setDeleteOpen(false);
      },
      onError: () => toast.error(t("Не вдалося видалити пост")),
    });
  }

  // §post-archive: архівований пост — компактна «муміфікована» картка. Схвалення/публікація/правки
  // тут не мають сенсу (пост прибрано з обігу), тож лишаємо тільки Розархівувати + Видалити назавжди.
  if (isArchived) {
    return (
      <Card className="opacity-70">
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-2 space-y-0">
          <div className="flex flex-wrap items-center gap-2">
            <ChannelBadge channel={item.channel} />
            <StatusBadge domain="item" status={item.status} />
            <span className="inline-flex items-center gap-1.5 rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
              <Archive className="h-3.5 w-3.5" aria-hidden />
              {t("В архіві")}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-1">
            {canEdit && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onUnarchive}
                disabled={archiveOps.unarchive.isPending}
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
                disabled={archiveOps.remove.isPending}
              >
                <Trash2 />
                {t("Видалити назавжди")}
              </Button>
            )}
          </div>
        </CardHeader>

        <CardContent>
          {(item.title ?? item.topic) && (
            <p className="text-sm font-medium text-muted-foreground">{item.title ?? item.topic}</p>
          )}
        </CardContent>

        <ConfirmDialog
          open={deleteOpen}
          onOpenChange={setDeleteOpen}
          pending={archiveOps.remove.isPending}
          title={t("Видалити пост назавжди?")}
          description={t("Пост, його історію версій та публікації буде видалено безповоротно. Цю дію не можна скасувати.")}
          confirmLabel={t("Видалити назавжди")}
          onConfirm={onDelete}
        />
      </Card>
    );
  }

  // §publishing: кнопку публікації показуємо лише для соц-каналів (channel === provider), схваленого
  // поста й ролі з publish:manage. blog таргета не має. Стан (pending/published/failed) — з publication.
  const isSocialChannel = (PUBLISH_PROVIDERS as readonly string[]).includes(item.channel);
  const showPublish = canPublish && isSocialChannel && item.status === "approved";
  const providerLabel = CONNECTION_PROVIDER_LABELS[item.channel as ConnectionProvider] ?? item.channel;
  const pubStatus = publication?.status;
  const publishInFlight = pubStatus === "pending" || publishPending;

  async function onCopy() {
    if (!item.text) return;
    try {
      await navigator.clipboard.writeText(item.text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error(t("Не вдалося скопіювати"));
    }
  }

  function startEdit() {
    setDraftText(item.text ?? "");
    setDraftTitle(item.title ?? "");
    setEditing(true);
  }

  function onSaveEdit() {
    const text = draftText.trim();
    if (!text) {
      toast.error(t("Текст поста не може бути порожнім"));
      return;
    }
    edit.mutate(
      { itemId: item.id, patch: { text, title: draftTitle.trim() || undefined } },
      {
        onSuccess: () => {
          toast.success(t("Пост збережено"));
          setEditing(false);
        },
        onError: () => toast.error(t("Не вдалося зберегти правку")),
      },
    );
  }

  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-2 space-y-0">
        <div className="flex flex-wrap items-center gap-2">
          <ChannelBadge channel={item.channel} />
          <StatusBadge domain="item" status={item.status} />
          <FlaggedBadge violationsCount={violationsCount} />
        </div>
        <div className="flex flex-wrap items-center gap-1">
          {canEdit && !editing && (
            <Button type="button" variant="ghost" size="sm" onClick={startEdit} disabled={!item.text}>
              <Pencil />
              {t("Редагувати")}
            </Button>
          )}
          {/* §post-archive: прибрати пост із основного списку (оборотно, content:edit). */}
          {canEdit && !editing && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onArchive}
              disabled={archiveOps.archive.isPending}
            >
              <Archive />
              {t("Архівувати")}
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setHistoryOpen(true)}
            aria-label={t("Історія версій")}
          >
            <History />
            {t("Історія")}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onCopy}
            disabled={!item.text}
            aria-label={t("Скопіювати текст")}
          >
            {copied ? <Check className="text-success" /> : <Copy />}
            {copied ? t("Скопійовано") : t("Копіювати")}
          </Button>
        </div>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        {editing ? (
          <div className="flex flex-col gap-2">
            <label htmlFor={`title-${item.id}`} className="text-xs font-medium text-muted-foreground">
              {t("Заголовок (необовʼязково)")}
            </label>
            <Input
              id={`title-${item.id}`}
              value={draftTitle}
              onChange={(e) => setDraftTitle(e.target.value)}
              placeholder={item.topic ?? ""}
              disabled={edit.isPending}
            />
          </div>
        ) : (
          (item.title ?? item.topic) && (
            <p className="text-sm font-medium">{item.title ?? item.topic}</p>
          )
        )}

        {/* Прев'ю зображення — лише instagram (FR-9.4); lazy-load, без падіння якщо ще немає. */}
        {item.channel === "instagram" &&
          (item.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={item.imageUrl}
              alt={item.topic ?? t("Згенероване зображення")}
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
                {t("Зображення генерується…")}
              </p>
            </div>
          ))}

        {editing ? (
          <div className="flex flex-col gap-2">
            {/* Один plain textarea для ВСІХ каналів (навіть blog): редагуємо сирий markdown/текст,
                рендерить його той самий канало-залежний PostBody після збереження. */}
            <Textarea
              value={draftText}
              onChange={(e) => setDraftText(e.target.value)}
              rows={8}
              disabled={edit.isPending}
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setEditing(false)}
                disabled={edit.isPending}
              >
                <X />
                {t("Скасувати")}
              </Button>
              <Button type="button" size="sm" onClick={onSaveEdit} disabled={edit.isPending}>
                {edit.isPending ? t("Зберігаємо…") : t("Зберегти")}
              </Button>
            </div>
          </div>
        ) : item.text ? (
          <PostBody text={item.text} channel={item.channel} />
        ) : (
          <p className="text-sm italic text-muted-foreground">{t("Текст ще генерується…")}</p>
        )}

        <Separator />

        <div className="flex flex-col gap-3">
          <h4 className="text-sm font-medium">{t("Оцінки Reviewer’а")}</h4>
          <ScoreMeter scores={item.scores} />
        </div>

        <div className="flex flex-col gap-2">
          <h4 className="text-sm font-medium">{t("Порушення")}</h4>
          <ViolationsPanel violations={item.violations} />
        </div>
      </CardContent>

      <div className="flex flex-wrap items-center gap-2 border-t border-border p-4">
        <Button
          size="sm"
          onClick={() => decision.mutate({ itemId: item.id, action: "approve" })}
          disabled={decision.isPending || item.status === "approved"}
        >
          {t("Схвалити")}
        </Button>
        <Button
          size="sm"
          variant="destructive"
          onClick={() => decision.mutate({ itemId: item.id, action: "reject" })}
          disabled={decision.isPending || item.status === "rejected"}
        >
          {t("Відхилити")}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setRerunOpen(true)}
          disabled={decision.isPending}
        >
          {t("Перегенерувати")}
        </Button>

        {/* §publishing: публікація схваленого соц-поста в підключений акаунт. */}
        {showPublish && (
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {pubStatus === "published" ? (
              <>
                <span className="inline-flex items-center gap-1.5 text-sm text-success">
                  <Check className="h-4 w-4" />
                  {t("Опубліковано")}
                </span>
                {publication?.externalUrl && (
                  <a
                    href={publication.externalUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                  >
                    <ExternalLink className="h-4 w-4" />
                    {t("Відкрити пост")}
                  </a>
                )}
              </>
            ) : pubStatus === "pending" ? (
              <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                {t("Публікується…")}
              </span>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                {pubStatus === "failed" && (
                  <span
                    className="inline-flex items-center gap-1.5 text-sm text-destructive"
                    title={publication?.error ?? undefined}
                  >
                    <AlertTriangle className="h-4 w-4" />
                    {t("Помилка публікації")}
                  </span>
                )}
                <Button
                  size="sm"
                  onClick={() => onPublish?.(item.id)}
                  // Вимкнено, якщо провайдер не підключений (підказка нижче) або публікація в польоті.
                  disabled={!providerConnected || publishInFlight}
                >
                  <Send className="h-4 w-4" />
                  {pubStatus === "failed" ? t("Опублікувати ще раз") : t("Опублікувати")}
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Підказка, коли публікувати нікуди: провайдер каналу не підключений. */}
      {showPublish && !providerConnected && pubStatus !== "published" && (
        <p className="px-4 pb-4 -mt-2 text-xs text-muted-foreground">
          {t("Спершу підключіть провайдера на сторінці «Підключення».")} ({providerLabel})
        </p>
      )}

      <RerunDialog
        open={rerunOpen}
        onOpenChange={setRerunOpen}
        pending={decision.isPending}
        title={t("Перегенерувати пост")}
        description={t("Пост піде на нову ітерацію (needs_revision). Можна додати інструкцію для Writer'а.")}
        onConfirm={(feedback) =>
          decision.mutate(
            { itemId: item.id, action: "rerun", feedback },
            { onSuccess: () => setRerunOpen(false) },
          )
        }
      />

      <VersionHistoryDialog
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        itemId={item.id}
        runId={runId}
        canRevert={canEdit}
      />
    </Card>
  );
}
