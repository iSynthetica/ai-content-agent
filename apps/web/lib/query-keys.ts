// Фабрика query keys (spike-3 §8.2). Ієрархічні ключі → точкова інвалідація.
export const qk = {
  accounts: () => ["accounts"] as const,
  companies: (accountId: string) => ["companies", accountId] as const,
  company: (companyId: string) => ["company", companyId] as const,
  settings: (companyId: string) => ["settings", companyId] as const,
  runs: (companyId: string) => ["runs", companyId] as const,
  run: (runId: string) => ["run", runId] as const,
  items: (runId: string) => ["items", runId] as const,
  // §13 онбординг
  bootstrap: (companyId: string) => ["bootstrap", companyId] as const,
  // §14 нотифікації + inbox (глобальні)
  notifications: () => ["notifications"] as const,
  inbox: () => ["inbox"] as const,
  // BYOK: ключі провайдерів акаунта (§ADR-0016)
  apiKeys: () => ["api-keys"] as const,
  // §15 план + слоти
  plan: (companyId: string) => ["plan", companyId] as const,
  planEntries: (companyId: string, range?: string) =>
    ["plan-entries", companyId, range ?? "all"] as const,
};
