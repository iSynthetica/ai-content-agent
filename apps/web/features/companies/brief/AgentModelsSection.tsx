"use client";

// Per-role вибір моделі (§ADR-0017): кожен текстовий агент може мати СВІЙ провайдер+модель поверх
// базового. Контрольований компонент — тримає лише перевизначені ролі; «за замовчуванням» прибирає
// роль із override (тоді працює базовий provider/model). visual тут не показуємо: зображення завжди
// OpenAI і керується базовими налаштуваннями.
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

type Override = { provider: Provider; model: string };
export type AgentModelsValue = Record<string, Override>;

export function AgentModelsSection({
  value,
  onChange,
}: {
  value: AgentModelsValue;
  onChange: (next: AgentModelsValue) => void;
}) {
  function setProvider(agent: string, provider: Provider | "") {
    if (!provider) {
      // «за замовчуванням» → прибрати override для цієї ролі
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
        Кожному задіяному провайдеру потрібен свій API-ключ.
      </p>
      <div className="flex flex-col gap-2">
        {AGENT_MODEL_KEYS.map((agent) => {
          const override = value[agent];
          const provider = override?.provider;
          return (
            <div key={agent} className="grid grid-cols-[9rem_1fr_1fr] items-center gap-2">
              <span className="text-sm font-medium">{AGENT_MODEL_LABELS[agent]}</span>
              <Select
                value={provider ?? ""}
                onChange={(e) => setProvider(agent, e.target.value as Provider | "")}
              >
                <option value="">За замовчуванням</option>
                {PROVIDERS.map((p) => (
                  <option key={p} value={p}>
                    {PROVIDER_LABELS[p]}
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
          );
        })}
      </div>
    </div>
  );
}
