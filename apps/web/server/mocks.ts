import "server-only";

// Вбудовані dev-фікстури (spike-3 «Моки»). Поки живого api немає (MOCK_API=1), і BFF-проксі
// (server/proxy.ts), і серверний apiClient (server/api-client.ts) консультуються з цим модулем,
// тож і RSC, і клієнтські запити через /api/* отримують дані без бекенду. Один центр моків →
// той самий контракт для обох шляхів. Коли api підніметься — виставити MOCK_API=0.
//
// getMock оперує `rest` — шлях api БЕЗ префікса /api і БЕЗ /v1 (напр. "/companies/cmp_demo").

import { CHANNEL_DEFAULTS } from "@forteq/shared";

export const MOCK_ENABLED = process.env.MOCK_API === "1";

export interface MockResult {
  status?: number; // за замовч. 200
  json: unknown;
}

// ── фікстури ──────────────────────────────────────────────────────────────────
const ACCOUNT = { id: "acc_forteq", name: "Forteq", role: "owner" as const };

const COMPANY = {
  id: "cmp_demo",
  name: "Forteq Systems",
  positioning: "Продуктова інженерія та AI-рішення для B2B SaaS",
  websiteUrl: "https://forteq.systems",
  description: "Команда, що будує надійні продукти й AI-агентів під ключ.",
  stack: ["TypeScript", "Next.js", "PostgreSQL", "LangGraph"],
  services: ["Розробка MVP", "AI-інтеграції", "Технічний аудит"],
  audience: "CTO та продуктові команди технологічних компаній",
};

const SETTINGS = {
  toneOfVoice: "Експертно-дружній, без жаргону та маркетингового шуму",
  toneExamples: ["Ми будуємо, а не обіцяємо.", "Складне — простими словами."],
  visualStyle: "Мінімалізм, синій акцент, багато повітря",
  forbiddenPhrases: ["революційний", "унікальна пропозиція"],
  language: "uk",
  provider: "openai" as const,
  models: null,
};

const CONTENT_PLAN = {
  channelCounts: CHANNEL_DEFAULTS,
  config: {
    cadence: { linkedin: { weekdays: ["tue", "thu"] } },
    pillars: ["Інженерна культура", "AI на практиці", "Кейси клієнтів"],
    topicMode: "suggest",
    planningHorizonWeeks: 4,
    autoGenerate: false,
    autoApprove: false,
  },
};

const SESSION = {
  user: { id: "usr_demo", email: "owner@forteq.systems", name: "Forteq Owner" },
  account: ACCOUNT,
};

function merge<T extends object>(base: T, patch: unknown): T {
  return patch && typeof patch === "object" ? { ...base, ...(patch as object) } : base;
}

// Повертає MockResult або undefined (тоді proxy/apiClient підуть у справжній fetch).
export function getMock(
  method: string,
  rest: string,
  _search: URLSearchParams,
  body?: unknown,
): MockResult | undefined {
  if (!MOCK_ENABLED) return undefined;
  const path = rest.split("?")[0];

  // ── auth (переважно короткозамкнено в server/auth.ts; тут — для authClient за потреби) ──
  if (path === "/auth/session" || path === "/auth/get-session") return { json: SESSION };
  if (path.startsWith("/auth/sign-out")) return { json: { ok: true } };
  if (path.startsWith("/auth/sign-in")) return { json: { user: SESSION.user, token: "mock" } };

  // ── акаунти / компанії ──
  if (method === "GET" && path === "/accounts") return { json: { items: [ACCOUNT] } };
  if (method === "GET" && /^\/accounts\/[^/]+\/companies$/.test(path))
    return { json: { items: [COMPANY] } };
  if (method === "GET" && /^\/companies\/[^/]+$/.test(path)) return { json: COMPANY };
  if (method === "PATCH" && /^\/companies\/[^/]+$/.test(path))
    return { json: merge(COMPANY, body) };
  if (method === "PUT" && /^\/companies\/[^/]+\/settings$/.test(path))
    return { json: merge(SETTINGS, body) };

  // ── контент-план ──
  if (method === "GET" && /^\/companies\/[^/]+\/content-plan$/.test(path))
    return { json: CONTENT_PLAN };
  if (method === "PUT" && /^\/companies\/[^/]+\/content-plan$/.test(path))
    return { json: merge(CONTENT_PLAN, body) };

  // ── прогони / айтеми (Фаза 1 — порожньо; наповнить пізніша фаза) ──
  if (method === "GET" && /^\/companies\/[^/]+\/runs$/.test(path)) return { json: { items: [] } };
  if (method === "POST" && /^\/companies\/[^/]+\/runs$/.test(path))
    return { json: { runId: "run_new" } };
  if (method === "GET" && /^\/runs\/[^/]+\/items$/.test(path)) return { json: { items: [] } };
  if (method === "GET" && /^\/runs\/[^/]+$/.test(path))
    return { json: { id: "run_new", companyId: COMPANY.id, status: "queued", scheduledFor: null, costCents: 0, createdAt: new Date().toISOString() } };

  // ── онбординг / bootstrap ──
  if (method === "POST" && path === "/onboarding") return { json: { companyId: "cmp_new" } };
  if (method === "POST" && /^\/companies\/[^/]+\/bootstrap$/.test(path))
    return { json: { jobId: "job_bootstrap" } };
  if (method === "GET" && /^\/companies\/[^/]+\/bootstrap$/.test(path))
    return { json: { status: "done", profile: {} } };

  // ── нотифікації / inbox ──
  if (method === "GET" && path === "/notifications") return { json: { items: [], unreadCount: 0 } };
  if (method === "GET" && path === "/inbox") return { json: { items: [] } };

  // ── план-слоти ──
  if (method === "GET" && /^\/companies\/[^/]+\/plan-entries$/.test(path))
    return { json: { items: [] } };

  // Безпечна сітка для решти дозволених шляхів, щоб екрани не падали в 502 у dev-моках.
  if (method === "GET") return { json: { items: [] } };
  return { json: { ok: true } };
}
