// Фабрика query keys (spike-3 §8.2). Ієрархічні ключі → точкова інвалідація.
export const qk = {
  accounts: () => ["accounts"] as const,
  companies: (accountId: string) => ["companies", accountId] as const,
  company: (companyId: string) => ["company", companyId] as const,
  settings: (companyId: string) => ["settings", companyId] as const,
  runs: (companyId: string) => ["runs", companyId] as const,
  // §run-archive: окремий вигляд архіву компанії. Префікс ["runs", companyId] спільний з основним
  // списком — тож інвалідація qk.runs(companyId) зачіпає обидва (прогін «переїжджає» між списками).
  runsArchived: (companyId: string) => ["runs", companyId, "archived"] as const,
  run: (runId: string) => ["run", runId] as const,
  items: (runId: string) => ["items", runId] as const,
  // §content-editing: історія версій одного поста
  itemVersions: (itemId: string) => ["item-versions", itemId] as const,
  // §13 онбординг
  bootstrap: (companyId: string) => ["bootstrap", companyId] as const,
  // §14 нотифікації + inbox (глобальні)
  notifications: () => ["notifications"] as const,
  inbox: () => ["inbox"] as const,
  // BYOK: ключі провайдерів акаунта (§ADR-0016)
  apiKeys: () => ["api-keys"] as const,
  // §publishing: підключення соцмереж/Telegram (глобальні) + стан публікацій по прогону
  connections: () => ["connections"] as const,
  publications: (runId: string) => ["publications", runId] as const,
  // §15 план + слоти
  plan: (companyId: string) => ["plan", companyId] as const,
  planEntries: (companyId: string, range?: string) =>
    ["plan-entries", companyId, range ?? "all"] as const,
};
