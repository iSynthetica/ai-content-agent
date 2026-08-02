"use client";

// Планувальник (§2.11, S-19) — слоти контент-плану, згруповані за датою.
//
// СПИСОК, а не календарна сітка: слот несе тему на кілька рядків, і в клітинку місяця вона не
// вміщується без обрізання. Сітка тут виграла б візуально й програла функціонально — рецензувати
// теми довелось би у тултипах. Календарний вигляд лишається можливим наступним кроком.
import * as React from "react";
import { CalendarPlus, Check, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ChannelBadge } from "@/components/common/channel-badge";
import { StatusBadge } from "@/components/common/status-badge";
import {
  useApproveEntries,
  useMaterializePlan,
  usePlanEntries,
  useSuggestTopics,
  useUpdateEntry,
  type PlanEntry,
} from "@/features/planner/use-plan-entries";
import { useLanguage, useT, type Language } from "@/lib/i18n";

function formatDay(date: string | null, language: Language, noDateLabel: string): string {
  if (!date) return noDateLabel;
  const locale = language === "en" ? "en-US" : "uk-UA";
  return new Date(`${date}T00:00:00Z`).toLocaleDateString(locale, {
    weekday: "short",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });
}

// Слоти без дати — це беклог: теми, відкладені «на потім». Показуємо їх окремо в кінці,
// інакше вони або загубились би, або зайняли б місце серед запланованих днів.
function groupByDay(items: PlanEntry[]): Array<[string, PlanEntry[]]> {
  const map = new Map<string, PlanEntry[]>();
  for (const it of items) {
    const key = it.date ?? "";
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(it);
  }
  return [...map.entries()].sort(([a], [b]) => {
    if (a === "") return 1;
    if (b === "") return -1;
    return a.localeCompare(b);
  });
}

function EntryRow({ entry, companyId }: { entry: PlanEntry; companyId: string }) {
  const t = useT();
  const update = useUpdateEntry(companyId);
  const [editing, setEditing] = React.useState(false);
  const [topic, setTopic] = React.useState(entry.topic ?? "");
  const [keyMessage, setKeyMessage] = React.useState(entry.keyMessage ?? "");

  // Слот, що вже пішов у генерацію, редагувати пізно: прогін працює зі знімком теми, і правка
  // створила б розбіжність між планом і згенерованим постом. Api це теж відхилить (409).
  const locked = entry.status === "generating" || entry.status === "generated";

  function save() {
    update.mutate(
      { id: entry.id, topic, keyMessage },
      {
        onSuccess: () => setEditing(false),
        onError: () => toast.error(t("Не вдалося зберегти тему")),
      },
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border border-border bg-background p-3">
      <div className="flex flex-wrap items-center gap-2">
        <ChannelBadge channel={entry.channel} />
        <StatusBadge domain="planEntry" status={entry.status} />
        {entry.pillar && (
          <span className="text-xs text-muted-foreground">· {entry.pillar}</span>
        )}
      </div>

      {editing ? (
        <div className="flex flex-col gap-2">
          <Input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder={t("Тема поста")} />
          <Textarea
            value={keyMessage}
            onChange={(e) => setKeyMessage(e.target.value)}
            placeholder={t("Ключове повідомлення")}
            rows={2}
          />
          <div className="flex gap-2">
            <Button size="sm" onClick={save} disabled={update.isPending || !topic.trim()}>
              {t("Зберегти")}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
              {t("Скасувати")}
            </Button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          className="flex flex-col items-start gap-1 text-left disabled:cursor-default"
          onClick={() => !locked && setEditing(true)}
          disabled={locked}
        >
          {entry.topic ? (
            <span className="text-sm font-medium">{entry.topic}</span>
          ) : (
            <span className="text-sm italic text-muted-foreground">
              {t("Тема ще не підібрана — натисніть «Підібрати теми» або впишіть свою")}
            </span>
          )}
          {entry.keyMessage && (
            <span className="text-xs text-muted-foreground">{entry.keyMessage}</span>
          )}
        </button>
      )}
    </div>
  );
}

export function PlannerBoard({ companyId }: { companyId: string }) {
  const { t, language } = useLanguage();
  const entries = usePlanEntries(companyId);
  const materialize = useMaterializePlan(companyId);
  const suggest = useSuggestTopics(companyId);
  const approve = useApproveEntries(companyId);

  const items = entries.data?.items ?? [];
  const groups = groupByDay(items);
  const proposed = items.filter((i) => i.status === "proposed" && i.topic);
  const missingTopics = items.filter((i) => !i.topic).length;

  function onMaterialize() {
    materialize.mutate(undefined, {
      onSuccess: (r) =>
        toast.success(
          r.created > 0
            ? `${t("Додано слотів")}: ${r.created}`
            : t("Нових слотів немає — план уже покриває горизонт"),
        ),
      // Найчастіша причина — не налаштований cadence. Показуємо повідомлення з api, а не загальне.
      onError: (e) => toast.error(e instanceof Error ? e.message : t("Не вдалося оновити план")),
    });
  }

  function onApproveAll() {
    approve.mutate(
      proposed.map((p) => p.id),
      {
        onSuccess: (r) =>
          // Розбіжність показуємо чесно: частина слотів могла бути вже не в `proposed`.
          toast.success(
            r.approved === r.requested
              ? `${t("Погоджено")}: ${r.approved}`
              : `${t("Погоджено")} ${r.approved} ${t("із")} ${r.requested} — ${t("решта вже змінили статус")}`,
          ),
        onError: () => toast.error(t("Не вдалося погодити слоти")),
      },
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" onClick={onMaterialize} disabled={materialize.isPending}>
          {materialize.isPending ? <Loader2 className="animate-spin" /> : <CalendarPlus />}
          {t("Оновити слоти")}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => suggest.mutate(undefined)}
          disabled={suggest.isPending || missingTopics === 0}
        >
          {suggest.isPending ? <Loader2 className="animate-spin" /> : <Sparkles />}
          {t("Підібрати теми")}{missingTopics > 0 ? ` (${missingTopics})` : ""}
        </Button>
        <Button size="sm" onClick={onApproveAll} disabled={approve.isPending || proposed.length === 0}>
          <Check />
          {t("Погодити всі")} ({proposed.length})
        </Button>
      </div>

      {entries.isLoading ? (
        <p className="text-sm text-muted-foreground">{t("Завантаження…")}</p>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <CalendarPlus className="size-8 text-muted-foreground" aria-hidden />
            <p className="font-medium">{t("Слотів ще немає")}</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              {t("Налаштуйте розклад публікацій у конфігурації плану, потім натисніть «Оновити слоти» — вони з’являться на горизонті планування.")}
            </p>
          </CardContent>
        </Card>
      ) : (
        groups.map(([day, dayItems]) => (
          <div key={day || "backlog"} className="flex flex-col gap-2">
            <h3 className="text-sm font-medium text-muted-foreground">{formatDay(day || null, language, t("Без дати"))}</h3>
            {dayItems.map((e) => (
              <EntryRow key={e.id} entry={e} companyId={companyId} />
            ))}
          </div>
        ))
      )}
    </div>
  );
}
