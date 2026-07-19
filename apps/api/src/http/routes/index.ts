import { Router } from "express";
import type { Composition } from "../../composition";
import { accountsController } from "../../controllers/accounts.controller";
import { companiesController } from "../../controllers/companies.controller";
import { settingsController } from "../../controllers/settings.controller";
import { contentPlansController } from "../../controllers/content-plans.controller";
import { onboardingController } from "../../controllers/onboarding.controller";
import { runsController } from "../../controllers/runs.controller";
import { decisionsController } from "../../controllers/decisions.controller";
import { notificationsController } from "../../controllers/notifications.controller";
import { plannerController } from "../../controllers/planner.controller";

// Бізнес-роути під /v1 (за auth-middleware). Кожен контролер сам відкриває request-scope (openScope):
// BEGIN + SET LOCAL app.current_* → репо/сервіси на tx → COMMIT/ROLLBACK + after-commit-хуки (§2.10.3).
export function businessRoutes(root: Composition): Router {
  const r = Router();
  const accounts = accountsController(root);
  const companies = companiesController(root);
  const settings = settingsController(root);
  const plans = contentPlansController(root);
  const onboarding = onboardingController(root);
  const runs = runsController(root);
  const decisions = decisionsController(root);
  const notifications = notificationsController(root);
  const planner = plannerController(root);

  // Акаунти користувача + компанії акаунта (switcher-и shell)
  r.get("/accounts", accounts.list);
  r.get("/accounts/:accountId/companies", accounts.companies);

  // Онбординг
  r.post("/onboarding", onboarding.onboard);

  // Компанії (CRUD)
  r.get("/companies", companies.list);
  r.post("/companies", companies.create);
  r.get("/companies/:companyId", companies.get);
  r.patch("/companies/:companyId", companies.update);
  r.delete("/companies/:companyId", companies.remove);

  // Bootstrap (enrichment)
  r.post("/companies/:companyId/bootstrap", onboarding.bootstrap);
  r.get("/companies/:companyId/bootstrap", onboarding.bootstrapStatus);

  // Налаштування (бренд + генерація)
  r.get("/companies/:companyId/settings", settings.get);
  r.put("/companies/:companyId/settings", settings.put);

  // Контент-план (config)
  r.get("/companies/:companyId/content-plan", plans.get);
  r.put("/companies/:companyId/content-plan", plans.put);

  // Прогони (create=enqueue, list=календар, detail, items)
  r.post("/companies/:companyId/runs", runs.create);
  r.get("/companies/:companyId/runs", runs.list);
  r.get("/runs/:id", runs.get);
  r.get("/runs/:id/items", runs.items);
  r.get("/runs/:id/export", runs.export);

  // HITL-рішення (§7): єдиний ендпоінт рішення на кожному рівні (approve|reject|rerun).
  // Тверда межа: api лише enqueue resume-job — граф ганяє worker.
  r.post("/runs/:id/decision", decisions.run);
  r.post("/content-items/:id/decision", decisions.item);

  // Нотифікації + Inbox (§2.13)
  r.get("/notifications", notifications.list);
  r.post("/notifications/:id/read", notifications.markRead);
  r.post("/notifications/read-all", notifications.markAllRead);
  r.get("/inbox", notifications.inbox);
  r.post("/inbox/:id/resolve", notifications.resolveInbox);

  // Планувальник (§2.11): слоти плану окремо від прогонів
  r.get("/companies/:companyId/plan-entries", planner.list);
  r.post("/companies/:companyId/plan/materialize", planner.materialize);
  r.post("/companies/:companyId/plan/suggest-topics", planner.suggestTopics);
  r.patch("/plan-entries/:id", planner.patch);
  r.post("/plan-entries/approve", planner.approve);

  return r;
}
