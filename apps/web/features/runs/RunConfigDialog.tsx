"use client";

// Конфігурація ОДНОГО прогону (§spec 08). Головне: генерація НЕ стартує від відкриття — лише після
// явного «Запустити генерацію» на кроці review. Два кроки: Configure → Review → (confirm). Scoped
// (з календаря) пропускає вибір каналів/к-сті — їх задають обрані слоти.
//
// Теми (Phase 2): «AI обере» (Strategist вигадує, к-сть контрольована) або «вписати вручну» — тоді
// генеруємо РІВНО введені теми (fan-out: один пост на тему), що дає точну к-сть і повний контроль.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { toast } from "sonner";
import { CHANNELS, CHANNEL_DEFAULTS, MAX_POSTS_PER_RUN, type Channel } from "@forteq/shared";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  AgentModelsSection,
  type AgentModelsValue,
} from "@/features/companies/brief/AgentModelsSection";
import { useCreateRun } from "@/features/runs/use-create-run";
import { useT } from "@/lib/i18n";

const CHANNEL_LABELS: Record<Channel, string> = {
  linkedin: "LinkedIn",
  twitter: "X (Twitter)",
  instagram: "Instagram",
  blog: "Блог",
};

export function RunConfigDialog({
  companyId,
  planEntryIds,
  onClose,
}: {
  companyId: string;
  planEntryIds?: string[];
  onClose: () => void;
}) {
  const t = useT();
  const scoped = (planEntryIds?.length ?? 0) > 0;
  const router = useRouter();
  const createRun = useCreateRun(companyId);

  const [step, setStep] = useState<"configure" | "review">("configure");
  const [included, setIncluded] = useState<Set<Channel>>(new Set(CHANNELS));
  const [counts, setCounts] = useState<Record<Channel, number>>({ ...CHANNEL_DEFAULTS });
  const [topicMode, setTopicMode] = useState<"ai" | "manual">("ai");
  const [manualTopics, setManualTopics] = useState<Record<string, string>>({});
  const [angle, setAngle] = useState("");
  const [agentModels, setAgentModels] = useState<AgentModelsValue>({});

  const activeChannels = CHANNELS.filter((c) => included.has(c));

  // Ручні теми: по одній на рядок у textarea кожного каналу.
  const linesFor = (c: Channel) =>
    (manualTopics[c] ?? "")
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
  const manualList = activeChannels.flatMap((c) => linesFor(c).map((topic) => ({ channel: c, topic })));

  // Підсумок для review + валідація.
  const aiTotal = activeChannels.reduce((s, c) => s + (counts[c] || 0), 0);
  const total = scoped ? planEntryIds!.length : topicMode === "manual" ? manualList.length : aiTotal;
  const tooMany = total > MAX_POSTS_PER_RUN;
  const canProceed = scoped || (total >= 1 && !tooMany);

  function toggle(c: Channel) {
    const next = new Set(included);
    next.has(c) ? next.delete(c) : next.add(c);
    setIncluded(next);
  }

  function confirm() {
    const body = scoped
      ? { planEntryIds }
      : topicMode === "manual"
        ? { topics: manualList }
        : {
            channels: activeChannels,
            counts: Object.fromEntries(activeChannels.map((c) => [c, counts[c]])),
          };
    createRun.mutate(
      {
        ...body,
        ...(angle.trim() ? { angle: angle.trim() } : {}),
        ...(Object.keys(agentModels).length ? { agentModels } : {}),
      },
      {
        onSuccess: ({ runId }) => {
          toast.success(t("Прогін запущено"));
          onClose();
          router.push(`/runs/${runId}`);
        },
      },
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-foreground/40" aria-hidden onClick={onClose} />
      <div className="relative flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-lg border border-border bg-background shadow-lg">
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <h2 className="text-base font-semibold">
            {step === "configure" ? t("Налаштування прогону") : t("Перевірка перед запуском")}
          </h2>
          <Button variant="ghost" size="icon" aria-label={t("Закрити")} onClick={onClose}>
            <X />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {step === "configure" ? (
            <div className="flex flex-col gap-5">
              {scoped ? (
                <p className="text-sm text-muted-foreground">
                  {t("Генерується")} {planEntryIds!.length} {t("обраних слотів із календаря. Теми й канали беруться зі слотів.")}
                </p>
              ) : (
                <>
                  <div className="flex flex-col gap-2">
                    <Label>{t("Канали")}</Label>
                    {CHANNELS.map((c) => (
                      <div key={c} className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          id={`ch-${c}`}
                          checked={included.has(c)}
                          onChange={() => toggle(c)}
                          className="h-4 w-4 accent-primary"
                        />
                        <label htmlFor={`ch-${c}`} className="w-28 text-sm">
                          {t(CHANNEL_LABELS[c])}
                        </label>
                        {topicMode === "ai" && (
                          <Input
                            type="number"
                            min={1}
                            max={MAX_POSTS_PER_RUN}
                            value={counts[c]}
                            disabled={!included.has(c)}
                            onChange={(e) =>
                              setCounts({ ...counts, [c]: Math.max(1, Number(e.target.value) || 1) })
                            }
                            className="w-20"
                            aria-label={`${t("Кількість постів")} ${t(CHANNEL_LABELS[c])}`}
                          />
                        )}
                      </div>
                    ))}
                  </div>

                  <div className="flex flex-col gap-2">
                    <Label>{t("Теми")}</Label>
                    <div className="flex gap-4 text-sm">
                      <label className="flex items-center gap-1.5">
                        <input
                          type="radio"
                          checked={topicMode === "ai"}
                          onChange={() => setTopicMode("ai")}
                          className="accent-primary"
                        />
                        {t("AI обере теми")}
                      </label>
                      <label className="flex items-center gap-1.5">
                        <input
                          type="radio"
                          checked={topicMode === "manual"}
                          onChange={() => setTopicMode("manual")}
                          className="accent-primary"
                        />
                        {t("Вписати вручну")}
                      </label>
                    </div>
                    {topicMode === "manual" && (
                      <div className="flex flex-col gap-3">
                        <p className="text-xs text-muted-foreground">
                          {t("По одній темі на рядок. Скільки тем — стільки постів (точна кількість).")}
                        </p>
                        {activeChannels.map((c) => (
                          <div key={c} className="flex flex-col gap-1">
                            <Label htmlFor={`tp-${c}`} className="text-xs">
                              {t(CHANNEL_LABELS[c])} ({linesFor(c).length})
                            </Label>
                            <Textarea
                              id={`tp-${c}`}
                              rows={3}
                              placeholder={t("Тема 1\nТема 2")}
                              value={manualTopics[c] ?? ""}
                              onChange={(e) => setManualTopics({ ...manualTopics, [c]: e.target.value })}
                            />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}

              <div className="flex flex-col gap-2">
                <Label htmlFor="angle">{t("Акцент / кут кампанії (необов’язково)")}</Label>
                <Textarea
                  id="angle"
                  rows={2}
                  placeholder={t("напр. фокус на економії часу для DevOps-команд")}
                  value={angle}
                  onChange={(e) => setAngle(e.target.value)}
                />
              </div>

              <div className="flex flex-col gap-2">
                <Label>{t("Моделі під ролі (необов’язково — інакше за налаштуваннями)")}</Label>
                <AgentModelsSection value={agentModels} onChange={setAgentModels} />
              </div>

              {!scoped && (
                <p className={`text-xs ${tooMany ? "text-destructive" : "text-muted-foreground"}`}>
                  {t("Разом")}: {total} {t("постів")}{tooMany ? ` — ${t("максимум")} ${MAX_POSTS_PER_RUN} ${t("на прогін")}` : ""}
                </p>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-4 text-sm">
              <div>
                <p className="mb-1 font-medium">{t("Що буде згенеровано")}</p>
                {scoped ? (
                  <p className="text-muted-foreground">{planEntryIds!.length} {t("слотів із календаря.")}</p>
                ) : topicMode === "manual" ? (
                  <ul className="text-muted-foreground">
                    {activeChannels
                      .filter((c) => linesFor(c).length > 0)
                      .map((c) => (
                        <li key={c}>
                          {t(CHANNEL_LABELS[c])} — {linesFor(c).length} ({t("ваші теми")})
                        </li>
                      ))}
                    <li className="mt-1 font-medium text-foreground">{t("Разом")}: {total} {t("постів")}</li>
                  </ul>
                ) : (
                  <ul className="text-muted-foreground">
                    {activeChannels.map((c) => (
                      <li key={c}>
                        {t(CHANNEL_LABELS[c])} — {counts[c]} ({t("теми обере AI")})
                      </li>
                    ))}
                    <li className="mt-1 font-medium text-foreground">{t("Разом")}: {total} {t("постів")}</li>
                  </ul>
                )}
              </div>
              {angle.trim() && (
                <div>
                  <p className="mb-1 font-medium">{t("Акцент")}</p>
                  <p className="text-muted-foreground">{angle.trim()}</p>
                </div>
              )}
              <div>
                <p className="mb-1 font-medium">{t("Моделі")}</p>
                <p className="text-muted-foreground">
                  {Object.keys(agentModels).length
                    ? Object.entries(agentModels)
                        .map(([role, m]) => `${role}: ${m.provider}/${m.model}`)
                        .join("; ")
                    : t("за збереженими налаштуваннями компанії")}
                </p>
              </div>
              <p className="text-xs text-muted-foreground">
                {t("Орієнтовна вартість — типово ≈ $0.07 на gpt-5-nano; сильніші моделі дорожчі. Точна вартість зʼявиться після прогону. Генерація йде на ваш API-ключ (BYOK).")}
              </p>
              {createRun.isError && (
                <p className="text-sm text-destructive">
                  {(createRun.error as Error)?.message ?? t("Не вдалося запустити прогін")}
                </p>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-border px-5 py-3">
          {step === "review" ? (
            <Button variant="ghost" onClick={() => setStep("configure")}>
              {t("Назад")}
            </Button>
          ) : (
            <span />
          )}
          {step === "configure" ? (
            <Button disabled={!canProceed} onClick={() => setStep("review")}>
              {t("Далі")}
            </Button>
          ) : (
            <Button disabled={createRun.isPending} onClick={confirm}>
              {createRun.isPending ? t("Запускаємо…") : t("Запустити генерацію")}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
