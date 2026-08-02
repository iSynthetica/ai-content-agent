import type { CompanySettings, ContentPlan } from "../repositories/interfaces";

// Знімок конфігурації на момент запуску прогону (spike-2 §4.4). Кладеться у
// generation_runs.model_config — worker читає його і не залежить від пізніших змін settings/plan.
export function snapshotModelConfig(
  settings: CompanySettings,
  plan: ContentPlan,
): Record<string, unknown> {
  return {
    provider: settings.provider,
    models: settings.models ?? {},
    // Per-slot override (§ADR-0017): undefined = легасі-режим. Резолвиться разом зі знімком у worker.
    agentModels: settings.agentModels ?? undefined,
    language: settings.language,
    channelCounts: plan.channelCounts,
    planConfig: plan.config ?? null,
  };
}
