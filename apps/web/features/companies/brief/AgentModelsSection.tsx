"use client";

// Per-role вибір моделі (§ADR-0017): кожен текстовий агент може мати СВІЙ провайдер+модель поверх
// базового. Контрольований компонент — тримає лише перевизначені ролі; «за замовчуванням» прибирає
// роль із override (тоді працює базовий provider/model). visual тут не показуємо: зображення завжди
// OpenAI і керується базовими налаштуваннями.
//
// Key-aware (UX): дропдаун провайдера знає, для яких провайдерів уже введено ключ. Провайдер без
// ключа позначається, і під рядком показується попередження — бо без ключа прогін не стартує.
import { AlertTriangle } from "lucide-react";
import {
  AGENT_MODEL_KEYS,
  AGENT_MODEL_LABELS,
  DEFAULT_MODELS_BY_PROVIDER,
  PROVIDERS,
  PROVIDER_LABELS,
  TEXT_MODELS,
  type Provider,
} from "@forteq/shared";

import { Select } from "@/components/ui/select";
import { useApiKeys } from "@/features/api-keys/use-api-keys";

type Override = { provider: Provider; model: string };
export type AgentModelsValue = Record<string, Override>;

export function AgentModelsSection({
  value,
  onChange,
}: {
  value: AgentModelsValue;
  onChange: (next: AgentModelsValue) => void;
}) {
  // Спільний кеш із менеджером ключів вище: ввів ключ → тут одразу видно.
  const { data: keys = [] } = useApiKeys();
  const configured = new Set(keys.map((k) => k.provider));

  function setProvider(agent: string, provider: Provider | "") {
    if (!provider) {
      const next = { ...value };
      delete next[agent];
      onChange(next);
      return;
    }
    const model = DEFAULT_MODELS_BY_PROVIDER[provider]?.[agent] ?? TEXT_MODELS[provider][0]?.id ?? "";
    onChange({ ...value, [agent]: { provider, model } });
  }

  function setModel(agent: string, model: string) {
    const current = value[agent];
    if (!current) return;
    onChange({ ...value, [agent]: { ...current, model } });
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        За замовчуванням усі ролі працюють на базовому провайдері вище. Тут можна перевизначити
        провайдера й модель окремо для кожної ролі (напр. дослідник на Gemini, автор на Claude).
      </p>
      <div className="flex flex-col gap-2">
        {AGENT_MODEL_KEYS.map((agent) => {
          const override = value[agent];
          const provider = override?.provider;
          const needsKey = provider ? !configured.has(provider) : false;
          return (
            <div key={agent} className="flex flex-col gap-1">
              <div className="grid grid-cols-[9rem_1fr_1fr] items-center gap-2">
                <span className="text-sm font-medium">{AGENT_MODEL_LABELS[agent]}</span>
                <Select
                  value={provider ?? ""}
                  onChange={(e) => setProvider(agent, e.target.value as Provider | "")}
                  aria-invalid={needsKey}
                >
                  <option value="">За замовчуванням</option>
                  {PROVIDERS.map((p) => (
                    <option key={p} value={p}>
                      {PROVIDER_LABELS[p]}
                      {configured.has(p) ? "" : " — немає ключа"}
                    </option>
                  ))}
                </Select>
                {provider ? (
                  <Select value={override.model} onChange={(e) => setModel(agent, e.target.value)}>
                    {TEXT_MODELS[provider].map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.label}
                      </option>
                    ))}
                  </Select>
                ) : (
                  <span className="text-sm text-muted-foreground">—</span>
                )}
              </div>
              {needsKey && (
                <p className="col-start-2 flex items-center gap-1 text-xs text-warning">
                  <AlertTriangle className="h-3 w-3" />
                  Додайте ключ {PROVIDER_LABELS[provider!]} вище, інакше прогін не запуститься.
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
