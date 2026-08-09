// Єдине джерело URL-меж web↔api (spike-3 §6.1). Ця таблиця має ДВОХ споживачів:
//   1) ALLOW/isAllowed — security-gate BFF-проксі (без нього catch-all = відкритий релей
//      до всієї поверхні api, SSRF-подібний обхід). Перевіряється ДО форварду.
//   2) endpoints.* — типізовані URL-білдери для клієнтських hooks і серверного apiClient.
// Обидва кодують ті самі шляхи; дрейф закриває drift-guard-тест (TODO S-3).
//
// Патерни в ALLOW — шлях api БЕЗ префікса /api і БЕЗ версійного /v1 (той додає forward()).
// Білдери endpoints.* повертають шлях ВЖЕ з /api (клієнт б'є в same-origin /api/*).

// Список ЗВІРЯЄТЬСЯ з роутами api автотестом (apps/api/test/route-allowlist.contract.test.ts).
// Він падає в обидва боки: і коли роут є в api, але його забули тут (фронт отримає 404 у проксі),
// і коли тут лишився запис без реалізації — така «обіцянка» ендпоінта помічається лише в рантаймі.
// SSE (/runs/:id/stream) свідомо ПРИБРАНО: шов на майбутнє, доки його немає в api, йому тут не місце.
// /media — реалізовано (роздача зображень постів): браузер тягне <img src=/api/media/...>, проксі
// форвардить у api /v1/media/:runId/:file (той стрімить байти зі спільного тому).
export const ALLOW: ReadonlyArray<{ method: string; pattern: RegExp }> = [
  { method: "GET", pattern: /^\/accounts$/ },
  { method: "GET", pattern: /^\/accounts\/[^/]+\/companies$/ },

  // Керування членами акаунта (§RBAC member-mgmt): list/add + change-role/remove
  { method: "GET", pattern: /^\/accounts\/[^/]+\/members$/ },
  { method: "POST", pattern: /^\/accounts\/[^/]+\/members$/ },
  { method: "PATCH", pattern: /^\/accounts\/[^/]+\/members\/[^/]+$/ },
  { method: "DELETE", pattern: /^\/accounts\/[^/]+\/members\/[^/]+$/ },
  { method: "GET", pattern: /^\/companies$/ },
  { method: "POST", pattern: /^\/companies$/ },
  { method: "GET", pattern: /^\/companies\/[^/]+$/ },
  { method: "DELETE", pattern: /^\/companies\/[^/]+$/ },
  { method: "PATCH", pattern: /^\/companies\/[^/]+$/ }, // company core
  { method: "GET", pattern: /^\/companies\/[^/]+\/settings$/ }, // бренд + дефолти генерації (read)
  { method: "PUT", pattern: /^\/companies\/[^/]+\/settings$/ }, // бренд + дефолти генерації (write)

  { method: "GET", pattern: /^\/companies\/[^/]+\/runs$/ },
  { method: "POST", pattern: /^\/companies\/[^/]+\/runs$/ }, // створити run — companyId у шляху
  { method: "POST", pattern: /^\/companies\/[^/]+\/runs\/estimate$/ }, // пре-ран оцінка вартості (Phase 4)
  { method: "GET", pattern: /^\/runs\/[^/]+$/ },
  { method: "GET", pattern: /^\/runs\/[^/]+\/items$/ },
  { method: "POST", pattern: /^\/runs\/[^/]+\/decision$/ }, // { action, feedback } по всьому run
  { method: "POST", pattern: /^\/content-items\/[^/]+\/decision$/ }, // { action, feedback } по item
  { method: "GET", pattern: /^\/runs\/[^/]+\/export$/ },

  // Роздача зображень постів (mediaUrl): /api/media/<runId>/<draftId>.<ext> → api /v1/media/:runId/:file
  { method: "GET", pattern: /^\/media\/[^/]+\/[^/]+$/ },

  // Topic preview (§runtopics): AI-підбір тем для ad-hoc прогону + поллінг чернетки
  { method: "POST", pattern: /^\/companies\/[^/]+\/runs\/suggest-topics$/ },
  { method: "GET", pattern: /^\/companies\/[^/]+\/topic-drafts\/[^/]+$/ },

  // Run-config пресети (§Phase 5): named-конфіг прогону
  { method: "GET", pattern: /^\/companies\/[^/]+\/presets$/ },
  { method: "POST", pattern: /^\/companies\/[^/]+\/presets$/ },
  { method: "DELETE", pattern: /^\/presets\/[^/]+$/ },

  // §content-editing: людське редагування поста + версії
  { method: "PATCH", pattern: /^\/content-items\/[^/]+$/ }, // { text, title? }
  { method: "GET", pattern: /^\/content-items\/[^/]+\/versions$/ },
  { method: "POST", pattern: /^\/content-items\/[^/]+\/revert$/ }, // { versionId }

  // §post-archive: архів/розархів (content:edit) + hard-delete (content:delete)
  { method: "POST", pattern: /^\/content-items\/[^/]+\/archive$/ },
  { method: "POST", pattern: /^\/content-items\/[^/]+\/unarchive$/ },
  { method: "DELETE", pattern: /^\/content-items\/[^/]+$/ }, // hard-delete (лише після архівації)

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

  // BYOK: ключі провайдерів акаунта (list + set/remove per provider)
  { method: "GET", pattern: /^\/api-keys$/ },
  { method: "PUT", pattern: /^\/api-keys\/[^/]+$/ },
  { method: "DELETE", pattern: /^\/api-keys\/[^/]+$/ },

  // §publishing: підключення соцмереж/Telegram + публікація схвалених постів
  { method: "GET", pattern: /^\/connections$/ },
  { method: "POST", pattern: /^\/connections\/[^/]+\/authorize$/ }, // → { authUrl } + state-cookie
  { method: "GET", pattern: /^\/connections\/[^/]+\/callback$/ }, // OAuth redirect-target (302 назад)
  { method: "PUT", pattern: /^\/connections\/telegram$/ }, // { botToken, chatId }
  { method: "DELETE", pattern: /^\/connections\/[^/]+$/ }, // відключити провайдера
  { method: "POST", pattern: /^\/runs\/[^/]+\/publish$/ }, // { itemIds } → enqueue content.publish
  { method: "GET", pattern: /^\/runs\/[^/]+\/publications$/ }, // per-run стан публікацій
  // Публічна роздача медіа за підписаним токеном (IG тягне сервером без сесії; транскод у JPEG)
  { method: "GET", pattern: /^\/media\/public\/[^/]+$/ },

  { method: "*", pattern: /^\/auth\/.+$/ }, // Better Auth: sign-in/out/session тощо
];

export function isAllowed(method: string, restPath: string): boolean {
  return ALLOW.some((a) => (a.method === "*" || a.method === method) && a.pattern.test(restPath));
}

// Типізовані URL-білдери (другий споживач тієї ж таблиці). Повертають шлях з /api.
export const endpoints = {
  accounts: () => "/api/accounts",
  companies: (aid: string) => `/api/accounts/${aid}/companies`,

  // Керування членами акаунта (§RBAC member-mgmt)
  members: (aid: string) => `/api/accounts/${aid}/members`, // GET список + POST додати
  member: (aid: string, userId: string) => `/api/accounts/${aid}/members/${userId}`, // PATCH роль / DELETE


  company: (cid: string) => `/api/companies/${cid}`, // GET деталі + PATCH company core
  settings: (cid: string) => `/api/companies/${cid}/settings`, // PUT бренд + дефолти
  runs: (cid: string) => `/api/companies/${cid}/runs`, // GET список + POST створити
  runEstimate: (cid: string) => `/api/companies/${cid}/runs/estimate`, // POST пре-ран оцінка вартості
  run: (id: string) => `/api/runs/${id}`,
  // archived — фільтр архіву (§post-archive). Без параметра api дефолтить на "exclude" (ховає архів);
  // "only" — окремий вигляд керування архівом. Query не входить у path, тож allowlist не змінюється.
  items: (id: string, archived?: "exclude" | "only" | "all") =>
    `/api/runs/${id}/items${archived ? `?archived=${archived}` : ""}`,
  runStream: (id: string) => `/api/runs/${id}/stream`,
  runDecision: (id: string) => `/api/runs/${id}/decision`,
  itemDecision: (id: string) => `/api/content-items/${id}/decision`,
  export: (id: string) => `/api/runs/${id}/export`,

  // Topic preview (§runtopics)
  suggestRunTopics: (cid: string) => `/api/companies/${cid}/runs/suggest-topics`,
  topicDraft: (cid: string, draftId: string) => `/api/companies/${cid}/topic-drafts/${draftId}`,

  // Run-config пресети (§Phase 5)
  presets: (cid: string) => `/api/companies/${cid}/presets`, // GET список + POST створити
  preset: (id: string) => `/api/presets/${id}`, // DELETE

  // §content-editing: людське редагування поста + версії
  itemEdit: (id: string) => `/api/content-items/${id}`,
  itemVersions: (id: string) => `/api/content-items/${id}/versions`,
  itemRevert: (id: string) => `/api/content-items/${id}/revert`,

  // §post-archive: архів/розархів + hard-delete поста
  itemArchive: (id: string) => `/api/content-items/${id}/archive`,
  itemUnarchive: (id: string) => `/api/content-items/${id}/unarchive`,
  itemDelete: (id: string) => `/api/content-items/${id}`, // DELETE (лише після архівації)

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

  // BYOK: ключі провайдерів акаунта
  apiKeys: () => "/api/api-keys",
  apiKey: (provider: string) => `/api/api-keys/${provider}`,

  // §publishing: підключення соцмереж/Telegram + публікація
  connections: () => "/api/connections", // GET список (items + configured)
  connectionAuthorize: (provider: string) => `/api/connections/${provider}/authorize`, // POST
  connectionCallback: (provider: string) => `/api/connections/${provider}/callback`, // GET redirect
  connectionTelegram: () => "/api/connections/telegram", // PUT { botToken, chatId }
  connection: (provider: string) => `/api/connections/${provider}`, // DELETE відключити
  runPublish: (id: string) => `/api/runs/${id}/publish`, // POST { itemIds }
  runPublications: (id: string) => `/api/runs/${id}/publications`, // GET per-run стан
  mediaPublic: (token: string) => `/api/media/public/${token}`, // GET публічне зображення (JPEG)
} as const;

// Знімає провідний префікс /api (спільна нормалізація для proxy й apiClient).
export function stripApiPrefix(path: string): string {
  return path.replace(/^\/api/, "");
}
