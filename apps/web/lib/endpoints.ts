// Єдине джерело URL-меж web↔api (spike-3 §6.1). Ця таблиця має ДВОХ споживачів:
//   1) ALLOW/isAllowed — security-gate BFF-проксі (без нього catch-all = відкритий релей
//      до всієї поверхні api, SSRF-подібний обхід). Перевіряється ДО форварду.
//   2) endpoints.* — типізовані URL-білдери для клієнтських hooks і серверного apiClient.
// Обидва кодують ті самі шляхи; дрейф закриває drift-guard-тест (TODO S-3).
//
// Патерни в ALLOW — шлях api БЕЗ префікса /api і БЕЗ версійного /v1 (той додає forward()).
// Білдери endpoints.* повертають шлях ВЖЕ з /api (клієнт б'є в same-origin /api/*).

export const ALLOW: ReadonlyArray<{ method: string; pattern: RegExp }> = [
  { method: "GET", pattern: /^\/accounts$/ },
  { method: "GET", pattern: /^\/accounts\/[^/]+\/companies$/ },
  { method: "GET", pattern: /^\/companies\/[^/]+$/ },
  { method: "PATCH", pattern: /^\/companies\/[^/]+$/ }, // company core
  { method: "GET", pattern: /^\/companies\/[^/]+\/settings$/ }, // бренд + дефолти генерації (read)
  { method: "PUT", pattern: /^\/companies\/[^/]+\/settings$/ }, // бренд + дефолти генерації (write)

  { method: "GET", pattern: /^\/companies\/[^/]+\/runs$/ },
  { method: "POST", pattern: /^\/companies\/[^/]+\/runs$/ }, // створити run — companyId у шляху
  { method: "GET", pattern: /^\/runs\/[^/]+$/ },
  { method: "GET", pattern: /^\/runs\/[^/]+\/items$/ },
  { method: "GET", pattern: /^\/runs\/[^/]+\/stream$/ }, // SSE-шов (§2.4; у МВП — polling)
  { method: "POST", pattern: /^\/runs\/[^/]+\/decision$/ }, // { action, feedback } по всьому run
  { method: "POST", pattern: /^\/content-items\/[^/]+\/decision$/ }, // { action, feedback } по item
  { method: "GET", pattern: /^\/runs\/[^/]+\/export$/ },
  { method: "GET", pattern: /^\/media\/.+$/ },

  // §13 онбординг + bootstrap
  { method: "POST", pattern: /^\/onboarding$/ },
  { method: "POST", pattern: /^\/companies\/[^/]+\/bootstrap$/ },
  { method: "GET", pattern: /^\/companies\/[^/]+\/bootstrap$/ },

  // §14 нотифікації + inbox
  { method: "GET", pattern: /^\/notifications$/ },
  { method: "POST", pattern: /^\/notifications\/[^/]+\/read$/ },
  { method: "POST", pattern: /^\/notifications\/read-all$/ },
  { method: "GET", pattern: /^\/inbox$/ },
  { method: "POST", pattern: /^\/inbox\/[^/]+\/resolve$/ },

  // §15 план + слоти
  { method: "GET", pattern: /^\/companies\/[^/]+\/content-plan$/ },
  { method: "PUT", pattern: /^\/companies\/[^/]+\/content-plan$/ },
  { method: "POST", pattern: /^\/companies\/[^/]+\/plan\/materialize$/ },
  { method: "POST", pattern: /^\/companies\/[^/]+\/plan\/suggest-topics$/ },
  { method: "GET", pattern: /^\/companies\/[^/]+\/plan-entries$/ },
  { method: "PATCH", pattern: /^\/plan-entries\/[^/]+$/ },
  { method: "POST", pattern: /^\/plan-entries\/approve$/ },

  { method: "*", pattern: /^\/auth\/.+$/ }, // Better Auth: sign-in/out/session тощо
];

export function isAllowed(method: string, restPath: string): boolean {
  return ALLOW.some((a) => (a.method === "*" || a.method === method) && a.pattern.test(restPath));
}

// Типізовані URL-білдери (другий споживач тієї ж таблиці). Повертають шлях з /api.
export const endpoints = {
  accounts: () => "/api/accounts",
  companies: (aid: string) => `/api/accounts/${aid}/companies`,
  company: (cid: string) => `/api/companies/${cid}`, // GET деталі + PATCH company core
  settings: (cid: string) => `/api/companies/${cid}/settings`, // PUT бренд + дефолти
  runs: (cid: string) => `/api/companies/${cid}/runs`, // GET список + POST створити
  run: (id: string) => `/api/runs/${id}`,
  items: (id: string) => `/api/runs/${id}/items`,
  runStream: (id: string) => `/api/runs/${id}/stream`,
  runDecision: (id: string) => `/api/runs/${id}/decision`,
  itemDecision: (id: string) => `/api/content-items/${id}/decision`,
  export: (id: string) => `/api/runs/${id}/export`,

  // §13 онбординг
  onboarding: () => "/api/onboarding",
  bootstrap: (cid: string) => `/api/companies/${cid}/bootstrap`,

  // §14 нотифікації + inbox
  notifications: () => "/api/notifications",
  notifRead: (id: string) => `/api/notifications/${id}/read`,
  notifReadAll: () => "/api/notifications/read-all",
  inbox: () => "/api/inbox",
  inboxResolve: (id: string) => `/api/inbox/${id}/resolve`,

  // §15 план + слоти
  contentPlan: (cid: string) => `/api/companies/${cid}/content-plan`,
  planMaterialize: (cid: string) => `/api/companies/${cid}/plan/materialize`,
  planSuggest: (cid: string) => `/api/companies/${cid}/plan/suggest-topics`,
  planEntries: (cid: string) => `/api/companies/${cid}/plan-entries`,
  planEntry: (id: string) => `/api/plan-entries/${id}`,
  planEntriesApprove: () => "/api/plan-entries/approve",
} as const;

// Знімає провідний префікс /api (спільна нормалізація для proxy й apiClient).
export function stripApiPrefix(path: string): string {
  return path.replace(/^\/api/, "");
}
