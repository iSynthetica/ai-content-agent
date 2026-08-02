"use client";

// Налаштування плану (§2.11, S-20): розклад публікацій, тематичні стовпи, горизонт.
//
// Cadence подана як ПЕРЕМИКАЧІ ДНІВ по каналах, а не поле для JSON. Форма з сирим JSON була б
// швидшою в реалізації і непридатною в користуванні: помилку в комі видно лише після збереження,
// а сенс «публікуємо в понеділок і середу» з тексту не читається.
import * as React from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { CHANNELS, WEEKDAYS } from "@forteq/shared";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { useUpdatePlanConfig } from "@/features/planner/use-update-plan-config";
import { useT } from "@/lib/i18n";

const WEEKDAY_LABELS: Record<string, string> = {
  mon: "Пн",
  tue: "Вт",
  wed: "Ср",
  thu: "Чт",
  fri: "Пт",
  sat: "Сб",
  sun: "Нд",
};

const CHANNEL_LABELS: Record<string, string> = {
  linkedin: "LinkedIn",
  twitter: "X (Twitter)",
  instagram: "Instagram",
  blog: "Блог",
};

// Тип днів беремо з контракту, а не оголошуємо string[]: інакше форма могла б зберегти
// неіснуючий день, і помилка спливла б аж на матеріалізації слотів.
type Weekday = (typeof WEEKDAYS)[number];
type ChannelRule = { weekdays?: Weekday[]; everyNWeeks?: number; weekday?: Weekday };
type Cadence = Record<string, ChannelRule>;

// Правило «раз на N тижнів» форма не редагує (рідкісний випадок, окремий UI), але МУСИТЬ його
// зберігати: інакше збереження щотижневого розкладу мовчки затерло б налаштування, якого
// користувач тут навіть не бачив. Тихе знищення чужих даних гірше за відсутність фічі.
function isPeriodic(rule: ChannelRule | undefined): boolean {
  return Boolean(rule?.everyNWeeks && !rule.weekdays?.length);
}

export function PlanConfigForm({
  companyId,
  initial,
}: {
  companyId: string;
  initial: { cadence?: Cadence; pillars?: string[]; planningHorizonWeeks?: number } | null;
}) {
  const t = useT();
  const update = useUpdatePlanConfig(companyId);

  const [cadence, setCadence] = React.useState<Cadence>(initial?.cadence ?? {});
  const [pillars, setPillars] = React.useState((initial?.pillars ?? []).join(", "));
  const [horizon, setHorizon] = React.useState(String(initial?.planningHorizonWeeks ?? 4));

  function toggleDay(channel: string, day: Weekday) {
    setCadence((prev) => {
      const days = new Set<Weekday>(prev[channel]?.weekdays ?? []);
      if (days.has(day)) days.delete(day);
      else days.add(day);

      const next = { ...prev };
      const preserved = prev[channel];
      if (days.size === 0) {
        // Канал без жодного дня прибираємо з cadence зовсім, а не лишаємо з порожнім масивом:
        // порожній масив на бекенді означав би «канал налаштований, але слотів не давати»,
        // і матеріалізація мовчки нічого б не створила.
        // Періодичне правило лишаємо, навіть коли всі дні знято — воно не належить цьому редактору.
        if (isPeriodic(preserved)) next[channel] = preserved!;
        else delete next[channel];
      } else {
        // Порядок днів фіксуємо за тижнем, а не за кліками — інакше збережений конфіг залежав би
        // від того, в якому порядку користувач тицяв кнопки.
        next[channel] = { ...preserved, weekdays: WEEKDAYS.filter((d) => days.has(d)) };
      }
      return next;
    });
  }

  const totalPerWeek = Object.values(cadence).reduce(
    (sum, c) => sum + (c.weekdays?.length ?? 0),
    0,
  );
  // Канал може бути налаштований періодично — тоді нуль щотижневих днів ще не означає порожній план.
  const hasAnyRule = Object.keys(cadence).length > 0;

  function onSave() {
    const weeks = Number(horizon);
    if (!Number.isFinite(weeks) || weeks < 1) {
      toast.error(t("Горизонт має бути додатним числом тижнів"));
      return;
    }
    update.mutate(
      {
        config: {
          cadence,
          pillars: pillars
            .split(",")
            .map((p) => p.trim())
            .filter(Boolean),
          planningHorizonWeeks: weeks,
        },
      },
      {
        onSuccess: () => toast.success(t("Розклад збережено")),
        onError: () => toast.error(t("Не вдалося зберегти розклад")),
      },
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>{t("Розклад публікацій")}</CardTitle>
          <CardDescription>
            {t("Дні тижня, у які виходить контент кожного каналу. З цього розкладу планувальник створює порожні слоти на горизонт планування.")}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          {CHANNELS.map((channel) => {
            const days = cadence[channel]?.weekdays ?? [];
            return (
              <div key={channel} className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <Label>{t(CHANNEL_LABELS[channel] ?? channel)}</Label>
                  <span className="text-xs text-muted-foreground">
                    {days.length > 0
                      ? `${days.length}/${t("тиждень")}`
                      : isPeriodic(cadence[channel])
                        ? t("періодично")
                        : t("не публікуємо")}
                  </span>
                </div>
                {isPeriodic(cadence[channel]) && (
                  // Канал налаштований періодичним правилом. Кажемо це прямо, інакше порожні
                  // перемикачі читались би як «не публікуємо», що неправда.
                  <p className="text-xs text-info">
                    {t("Налаштовано окремим правилом: раз на")} {cadence[channel]!.everyNWeeks} {t("тиж.")}
                    {cadence[channel]!.weekday
                      ? ` (${t(WEEKDAY_LABELS[cadence[channel]!.weekday!])})`
                      : ""}
                    . {t("Вибір днів нижче його замінить.")}
                  </p>
                )}
                <div className="flex flex-wrap gap-1.5">
                  {WEEKDAYS.map((day) => {
                    const active = days.includes(day);
                    return (
                      <button
                        key={day}
                        type="button"
                        aria-pressed={active}
                        onClick={() => toggleDay(channel, day)}
                        className={cn(
                          "h-9 w-11 rounded-md border text-sm transition-colors",
                          active
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border bg-background hover:bg-muted",
                        )}
                      >
                        {t(WEEKDAY_LABELS[day])}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {totalPerWeek === 0 && !hasAnyRule && (
            // Попереджаємо ДО збереження: без жодного дня матеріалізація поверне 400, і краще
            // сказати про це тут, ніж дати натиснути «Оновити слоти» і отримати помилку.
            <p className="text-sm text-warning">
              {t("Не обрано жодного дня — планувальник не зможе створити слоти.")}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("Теми й горизонт")}</CardTitle>
          <CardDescription>
            {t("Стовпи задають тематичні напрями, у межах яких підбираються теми.")}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5">
          <div className="flex flex-col gap-2">
            <Label htmlFor="pillars">{t("Тематичні стовпи")}</Label>
            <Input
              id="pillars"
              value={pillars}
              onChange={(e) => setPillars(e.target.value)}
              placeholder={t("архітектура, DevOps, кейси клієнтів")}
            />
            <p className="text-xs text-muted-foreground">{t("Через кому.")}</p>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="horizon">{t("Горизонт планування, тижнів")}</Label>
            <Input
              id="horizon"
              type="number"
              min={1}
              value={horizon}
              onChange={(e) => setHorizon(e.target.value)}
              className="max-w-32"
            />
            <p className="text-xs text-muted-foreground">
              {t("На скільки тижнів наперед створюються слоти. Орієнтовно")}{" "}
              {totalPerWeek * (Number(horizon) || 0)} {t("слотів.")}
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={onSave} disabled={update.isPending}>
          {update.isPending && <Loader2 className="animate-spin" />}
          {t("Зберегти розклад")}
        </Button>
      </div>
    </div>
  );
}
