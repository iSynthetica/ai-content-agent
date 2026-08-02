import type { CompanySettings, ContentPlan } from "../repositories/interfaces";

// Per-run overrides (§spec 08): лічильники й моделі на ОДИН прогін, не мутуючи settings/plan.
// undefined-поле = «як збережено»; для agentModels null явно скидає у легасі-режим на цей прогін.
export interface ModelConfigOverrides {
  channelCounts?: Record<string, number>;
  agentModels?: Record<string, { provider: string; model: string }> | null;
}

// Знімок конфігурації на момент запуску прогону (spike-2 §4.4). Кладеться у
// generation_runs.model_config — worker читає його і не залежить від пізніших змін settings/plan.
export function snapshotModelConfig(
  settings: CompanySettings,
  plan: ContentPlan,
  overrides?: ModelConfigOverrides,
): Record<string, unknown> {
  const agentModels =
    overrides?.agentModels !== undefined ? overrides.agentModels : settings.agentModels;
  return {
    provider: settings.provider,
    models: settings.models ?? {},
    // Per-slot override (§ADR-0017): undefined = легасі-режим. Резолвиться разом зі знімком у worker.
    agentModels: agentModels ?? undefined,
    language: settings.language,
    // Per-run лічильники виграють над планом (worker читає counts зі знімка, не з живого плану).
    channelCounts: overrides?.channelCounts ?? plan.channelCounts,
    planConfig: plan.config ?? null,
  };
}
