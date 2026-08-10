"use client";

// Конфігурація ОДНОГО прогону (§spec 08). Головне: генерація НЕ стартує від відкриття — лише після
// явного «Запустити генерацію» на кроці review. Два кроки: Configure → Review → (confirm). Scoped
// (з календаря) пропускає вибір каналів/к-сті — їх задають обрані слоти.
//
// Теми: два режими (сліпий «AI обере» прибрано — його надмножина «AI пропонує → редагувати»):
// «вписати вручну» (генеруємо РІВНО введені теми — fan-out: один пост на тему) або «AI пропонує →
// редагувати» (topic preview, §runtopics, ДЕФОЛТ): AI пропонує теми ЗАЗДАЛЕГІДЬ окремим LLM-викликом
// (async job, поллінг), людина їх редагує/викидає — і вже затверджений список іде у ТОЙ САМИЙ шлях,
// що ручний ввід — createRun.topics (жодного другого шляху створення прогону). Обидва режими несуть
// явні topics, тож «сліпого» вигадування тем без перегляду людиною більше немає.
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { toast } from "sonner";
import {
  CHANNELS,
  CHANNEL_DEFAULTS,
  MAX_POSTS_PER_RUN,
  type Channel,
  type RunPresetConfig,
  type RunTopicInput,
} from "@forteq/shared";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  AgentModelsSection,
  type AgentModelsValue,
} from "@/features/companies/brief/AgentModelsSection";
import { useCreateRun } from "@/features/runs/use-create-run";
import { useEstimateRun } from "@/features/runs/use-estimate-run";
import { useCreatePreset, useDeletePreset, usePresets } from "@/features/runs/use-presets";
import { useSuggestRunTopics, useTopicDraft } from "@/features/runs/use-suggest-topics";
import { useT } from "@/lib/i18n";
import { formatCost } from "@/lib/format";

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
  const suggestRunTopics = useSuggestRunTopics(companyId);

  const [step, setStep] = useState<"configure" | "review">("configure");
  const [included, setIncluded] = useState<Set<Channel>>(new Set(CHANNELS));
  const [counts, setCounts] = useState<Record<Channel, number>>({ ...CHANNEL_DEFAULTS });
  const [topicMode, setTopicMode] = useState<"manual" | "preview">("preview");
  const [manualTopics, setManualTopics] = useState<Record<string, string>>({});
  const [angle, setAngle] = useState("");
  const [agentModels, setAgentModels] = useState<AgentModelsValue>({});
  // Друге підтвердження на дорогий прогін (Phase 4): чекбокс мусить бути ввімкнений, щоб запустити.
  const [ackExpensive, setAckExpensive] = useState(false);
  // Run-config пресети (§Phase 5): застосувати збережену конфігурацію / зберегти поточну.
  const presetsQuery = usePresets(companyId);
  const createPreset = useCreatePreset(companyId);
  const deletePreset = useDeletePreset(companyId);

  // Topic preview (§runtopics): draftId — активний запит на пропозицію; previewTopics — РЕДАГОВАНА
  // копія результату (не сам draft — draft лишається read-only знімком того, що повернув AI).
  const [draftId, setDraftId] = useState<string | null>(null);
  const [previewTopics, setPreviewTopics] = useState<RunTopicInput[]>([]);
  const initializedDraftId = useRef<string | null>(null);
  const draftQuery = useTopicDraft(companyId, draftId);

  const activeChannels = CHANNELS.filter((c) => included.has(c));

  // Ручні теми: по одній на рядок у textarea кожного каналу.
  const linesFor = (c: Channel) =>
    (manualTopics[c] ?? "")
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
  const manualList = activeChannels.flatMap((c) => linesFor(c).map((topic) => ({ channel: c, topic })));

  // Коли пропозиція готова — переносимо результат у РЕДАГОВАНУ копію. Робимо це РІВНО раз на
  // draftId (не на кожен рендер/poll): інакше правки людини затирались би повторним рефетчем.
  useEffect(() => {
    if (draftQuery.data?.status === "ready" && initializedDraftId.current !== draftId) {
      initializedDraftId.current = draftId;
      setPreviewTopics(draftQuery.data.topics ?? []);
    }
  }, [draftId, draftQuery.data]);

  function requestPreview() {
    setPreviewTopics([]);
    initializedDraftId.current = null;
    suggestRunTopics.mutate(
      {
        channels: activeChannels,
        counts: Object.fromEntries(activeChannels.map((c) => [c, counts[c] || 1])),
        ...(angle.trim() ? { angle: angle.trim() } : {}),
      },
      { onSuccess: ({ draftId: id }) => setDraftId(id) },
    );
  }

  function resetPreview() {
    setDraftId(null);
    setPreviewTopics([]);
    initializedDraftId.current = null;
  }

  function updatePreviewTopic(index: number, topic: string) {
    setPreviewTopics(previewTopics.map((p, i) => (i === index ? { ...p, topic } : p)));
  }
  function removePreviewTopic(index: number) {
    setPreviewTopics(previewTopics.filter((_, i) => i !== index));
  }
  function addPreviewTopic(channel: Channel) {
    setPreviewTopics([...previewTopics, { channel, topic: "" }]);
  }

  const previewReady = draftQuery.data?.status === "ready";
  const previewPending =
    suggestRunTopics.isPending ||
    (draftId !== null && (draftQuery.data?.status === "pending" || !draftQuery.data));
  const previewFailed = draftQuery.data?.status === "failed";
  const previewList = previewTopics.filter((p) => p.topic.trim());
  // Канали для редагованого списку — з РЕЗУЛЬТАТУ (не з чекбоксів вгорі): після генерації людина
  // працює зі списком, а не перевибирає канали.
  const previewChannels = CHANNELS.filter((c) => previewTopics.some((p) => p.channel === c));

  // Підсумок для review + валідація. Обидва ad-hoc режими несуть явні topics (manual/preview).
  const total = scoped
    ? planEntryIds!.length
    : topicMode === "manual"
      ? manualList.length
      : previewList.length;
  const tooMany = total > MAX_POSTS_PER_RUN;
  const canProceed = scoped || (total >= 1 && !tooMany);

  // Пре-ран оцінка вартості (Phase 4): рахуємо ЛИШЕ на кроці review й лише коли конфіг валідний
  // (інакше — зайві виклики й оцінка недопасованого стану). Тіло = те саме, що піде у createRun.
  const estimateBody = step === "review" && canProceed ? buildRunBody() : null;
  const estimateQuery = useEstimateRun(companyId, estimateBody);
  const estimate = estimateQuery.data;
  // Дорогий прогін блокує кнопку, доки людина не підтвердить чекбоксом.
  const blockedByCost = Boolean(estimate?.expensive) && !ackExpensive;

  function toggle(c: Channel) {
    const next = new Set(included);
    next.has(c) ? next.delete(c) : next.add(c);
    setIncluded(next);
  }

  // Тіло createRun/estimate — ЄДИНЕ джерело (обидва шляхи мусять слати те саме, інакше оцінка
  // рахувала б не той прогін, що запуститься). scoped → слоти; manual/preview → явні topics.
  function buildRunBody(): Record<string, unknown> {
    const base = scoped
      ? { planEntryIds }
      : topicMode === "manual"
        ? { topics: manualList }
        : { topics: previewList.map((p) => ({ ...p, topic: p.topic.trim() })) };
    return {
      ...base,
      ...(angle.trim() ? { angle: angle.trim() } : {}),
      ...(Object.keys(agentModels).length ? { agentModels } : {}),
    };
  }

  // §Phase 5: застосувати збережений пресет до полів діалогу (лише ad-hoc — scoped не має каналів/к-сті).
  function applyPreset(cfg: RunPresetConfig) {
    if (cfg.channels?.length) setIncluded(new Set(cfg.channels as Channel[]));
    if (cfg.counts) setCounts({ ...CHANNEL_DEFAULTS, ...(cfg.counts as Record<Channel, number>) });
    setAgentModels((cfg.agentModels ?? {}) as AgentModelsValue);
    setAngle(cfg.angle ?? "");
    setTopicMode("preview"); // пресети НЕ несуть тем → дефолтний режим «AI пропонує → редагувати»
    toast.success(t("Пресет застосовано"));
  }

  // §Phase 5: зберегти поточну ad-hoc конфігурацію як named-пресет (теми свідомо не зберігаємо).
  function saveCurrentAsPreset() {
    const name = window.prompt(t("Назва пресету"))?.trim();
    if (!name) return;
    const config: RunPresetConfig = {
      channels: activeChannels,
      counts: Object.fromEntries(activeChannels.map((c) => [c, counts[c]])),
      ...(Object.keys(agentModels).length ? { agentModels } : {}),
      ...(angle.trim() ? { angle: angle.trim() } : {}),
    };
    createPreset.mutate(
      { name, config },
      {
        onSuccess: () => toast.success(t("Пресет збережено")),
        onError: (e) => toast.error((e as Error)?.message ?? t("Не вдалося зберегти пресет")),
      },
    );
  }

  function confirm() {
    createRun.mutate(
      buildRunBody(),
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
                  {/* §Phase 5: пресети — застосувати збережену конфігурацію або зберегти поточну */}
                  <div className="flex flex-col gap-2 rounded-md border border-border bg-muted/30 p-3">
                    <Label>{t("Пресети конфігурації")}</Label>
                    <div className="flex flex-wrap items-center gap-2">
                      <select
                        aria-label={t("Застосувати пресет")}
                        className="h-9 flex-1 rounded-md border border-border bg-background px-2 text-sm"
                        value=""
                        onChange={(e) => {
                          const p = presetsQuery.data?.find((x) => x.id === e.target.value);
                          if (p) applyPreset(p.config);
                        }}
                      >
                        <option value="">
                          {presetsQuery.data?.length
                            ? t("Застосувати пресет…")
                            : t("Немає збережених пресетів")}
                        </option>
                        {presetsQuery.data?.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                      <Button
                        variant="ghost"
                        onClick={saveCurrentAsPreset}
                        disabled={createPreset.isPending || activeChannels.length === 0}
                      >
                        {t("Зберегти поточне")}
                      </Button>
                    </div>
                    {(presetsQuery.data?.length ?? 0) > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {presetsQuery.data!.map((p) => (
                          <button
                            key={p.id}
                            type="button"
                            className="text-xs text-muted-foreground underline decoration-dotted hover:text-destructive"
                            onClick={() => deletePreset.mutate(p.id)}
                          >
                            ✕ {p.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
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
                        {topicMode === "preview" && !previewReady && !previewPending && (
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
                    <div className="flex flex-wrap gap-4 text-sm">
                      <label className="flex items-center gap-1.5">
                        <input
                          type="radio"
                          checked={topicMode === "preview"}
                          onChange={() => setTopicMode("preview")}
                          className="accent-primary"
                        />
                        {t("AI пропонує → редагувати")}
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

                    {topicMode === "preview" && (
                      <div className="flex flex-col gap-3">
                        {!draftId && !suggestRunTopics.isPending && (
                          <>
                            <p className="text-xs text-muted-foreground">
                              {t("AI запропонує теми для обраних каналів — ви зможете відредагувати їх перед запуском.")}
                            </p>
                            <Button
                              type="button"
                              variant="outline"
                              disabled={activeChannels.length === 0}
                              onClick={requestPreview}
                            >
                              {t("Запропонувати теми")}
                            </Button>
                          </>
                        )}

                        {suggestRunTopics.isError && (
                          <p className="text-sm text-destructive">
                            {(suggestRunTopics.error as Error)?.message ?? t("Не вдалося запросити теми")}
                          </p>
                        )}

                        {previewPending && (
                          <p className="text-sm text-muted-foreground">{t("Підбираємо теми…")}</p>
                        )}

                        {previewFailed && (
                          <div className="flex flex-col gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3">
                            <p className="text-sm text-destructive">
                              {draftQuery.data?.error ?? t("Не вдалося підібрати теми")}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {t("Спробуйте ще раз або оберіть інший режим тем вище.")}
                            </p>
                            <Button type="button" variant="outline" size="sm" onClick={resetPreview}>
                              {t("Спробувати ще раз")}
                            </Button>
                          </div>
                        )}

                        {previewReady && (
                          <div className="flex flex-col gap-4">
                            {previewChannels.map((c) => (
                              <div key={c} className="flex flex-col gap-1.5">
                                <Label className="text-xs">{t(CHANNEL_LABELS[c])}</Label>
                                {previewTopics.map((p, i) =>
                                  p.channel === c ? (
                                    <div key={i} className="flex items-center gap-1.5">
                                      <Input
                                        value={p.topic}
                                        placeholder={t("Тема")}
                                        onChange={(e) => updatePreviewTopic(i, e.target.value)}
                                        aria-label={`${t("Тема")} ${t(CHANNEL_LABELS[c])} ${i + 1}`}
                                      />
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        aria-label={t("Видалити тему")}
                                        onClick={() => removePreviewTopic(i)}
                                      >
                                        <X className="h-4 w-4" />
                                      </Button>
                                    </div>
                                  ) : null,
                                )}
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="self-start"
                                  onClick={() => addPreviewTopic(c)}
                                >
                                  {t("+ Додати тему")}
                                </Button>
                              </div>
                            ))}
                            <Button type="button" variant="outline" size="sm" className="self-start" onClick={resetPreview}>
                              {t("Запропонувати ще раз")}
                            </Button>
                          </div>
                        )}
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
                <AgentModelsSection companyId={companyId} value={agentModels} onChange={setAgentModels} />
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
                    {previewChannels.map((c) => (
                      <li key={c}>
                        {t(CHANNEL_LABELS[c])} — {previewList.filter((p) => p.channel === c).length} ({t("теми AI, відредаговані")})
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
              <div className="rounded-md border border-border bg-muted/40 p-3 text-xs">
                <div className="flex items-baseline justify-between">
                  <span className="font-medium text-foreground">{t("Орієнтовна вартість")}</span>
                  <span className="text-sm font-semibold text-foreground">
                    {estimateQuery.isPending
                      ? "…"
                      : estimate
                        ? `≈ ${formatCost(estimate.cents)}`
                        : "—"}
                  </span>
                </div>
                {estimate && (
                  <p className="mt-1 text-muted-foreground">
                    {t("текст")}: {formatCost(estimate.textCents)}
                    {estimate.images > 0
                      ? ` · ${t("зображення")}: ${formatCost(estimate.imageCents)} (${estimate.images})`
                      : ""}
                  </p>
                )}
                <p className="mt-1 text-muted-foreground">
                  {t("Це оцінка — точна вартість зʼявиться після прогону. Генерація йде на ваш API-ключ (BYOK).")}
                </p>
                {estimate?.expensive && (
                  <label className="mt-2 flex items-start gap-2 text-destructive">
                    <input
                      type="checkbox"
                      className="mt-0.5"
                      checked={ackExpensive}
                      onChange={(e) => setAckExpensive(e.target.checked)}
                    />
                    <span>
                      {t("Дорогий прогін")} (≈ {formatCost(estimate.cents)}) — {t("підтверджую запуск")}
                    </span>
                  </label>
                )}
              </div>
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
            <Button
              variant="ghost"
              onClick={() => {
                setAckExpensive(false); // повернення до конфігу скидає підтвердження дорогого прогону
                setStep("configure");
              }}
            >
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
            <Button disabled={createRun.isPending || blockedByCost} onClick={confirm}>
              {createRun.isPending ? t("Запускаємо…") : t("Запустити генерацію")}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
