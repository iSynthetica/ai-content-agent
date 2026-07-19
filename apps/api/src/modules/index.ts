// src/modules/ — місце майбутніх доменних модулів (Фаза 1).
// Кожен модуль = routes + controller + service (spike-2 §2.2, §3):
//   auth/  onboarding/  companies/  settings/  content-plans/
//   plan-entries/  runs/  content-items/  notifications/  export/
//
// Каркас (API-3) навмисно НЕ містить бізнес-ендпоінтів — лише GET /v1/health у server.ts.
// У Фазі 1 роути монтуються під /v1 через ці модулі (за auth-middleware + request-scope UnitOfWork).
export {};
