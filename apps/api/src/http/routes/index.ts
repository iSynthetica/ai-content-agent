import { Router } from "express";
import type { Composition } from "../../composition";
import { requirePermission } from "../middlewares/require-permission";
import { accountsController } from "../../controllers/accounts.controller";
import { companiesController } from "../../controllers/companies.controller";
import { settingsController } from "../../controllers/settings.controller";
import { contentPlansController } from "../../controllers/content-plans.controller";
import { onboardingController } from "../../controllers/onboarding.controller";
import { runsController } from "../../controllers/runs.controller";
import { decisionsController } from "../../controllers/decisions.controller";
import { contentItemsController } from "../../controllers/content-items.controller";
import { notificationsController } from "../../controllers/notifications.controller";
import { plannerController } from "../../controllers/planner.controller";
import { apiKeysController } from "../../controllers/api-keys.controller";
import { runTopicsController } from "../../controllers/run-topics.controller";

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
  const contentItems = contentItemsController(root);
  const notifications = notificationsController(root);
  const planner = plannerController(root);
  const apiKeys = apiKeysController(root);
  const runTopics = runTopicsController(root);

  // Акаунти користувача + компанії акаунта (switcher-и shell)
  r.get("/accounts", accounts.list);
  r.get("/accounts/:accountId/companies", accounts.companies);

  // RBAC (§ADR-0015): мутуючі роути стережуться requirePermission за матрицею @forteq/shared.
  // GET-и дозволу не потребують — читає будь-який член акаунта (viewer), ізоляцію форсить RLS.
  // Нотифікації/Inbox лишаються без гварда: це персональний фід користувача, не мутація контенту.

  // Онбординг — створює компанію
  r.post("/onboarding", requirePermission("company:write"), onboarding.onboard);

  // Компанії (CRUD)
  r.get("/companies", companies.list);
  r.post("/companies", requirePermission("company:write"), companies.create);
  r.get("/companies/:companyId", companies.get);
  r.patch("/companies/:companyId", requirePermission("company:write"), companies.update);
  r.delete("/companies/:companyId", requirePermission("company:delete"), companies.remove);

  // Bootstrap (enrichment) — наповнює бренд-профіль у налаштуваннях
  r.post("/companies/:companyId/bootstrap", requirePermission("settings:write"), onboarding.bootstrap);
  r.get("/companies/:companyId/bootstrap", onboarding.bootstrapStatus);

  // Налаштування (бренд + генерація)
  r.get("/companies/:companyId/settings", settings.get);
  r.put("/companies/:companyId/settings", requirePermission("settings:write"), settings.put);

  // Контент-план (config)
  r.get("/companies/:companyId/content-plan", plans.get);
  r.put("/companies/:companyId/content-plan", requirePermission("plan:write"), plans.put);

  // Прогони (create=enqueue, list=календар, detail, items)
  r.post("/companies/:companyId/runs", requirePermission("run:start"), runs.create);
  r.get("/companies/:companyId/runs", runs.list);
  r.get("/runs/:id", runs.get);
  r.get("/runs/:id/items", runs.items);
  r.get("/runs/:id/export", runs.export);

  // Topic preview (§runtopics): AI пропонує теми для ad-hoc прогону ще ДО генерації (LLM-виклик →
  // run:start, як і сам запуск). getDraft — поллінг, читає будь-який член акаунта (RLS ізолює).
  r.post(
    "/companies/:companyId/runs/suggest-topics",
    requirePermission("run:start"),
    runTopics.suggest,
  );
  r.get("/companies/:companyId/topic-drafts/:draftId", runTopics.getDraft);

  // HITL-рішення (§7): єдиний ендпоінт рішення на кожному рівні (approve|reject|rerun).
  // Тверда межа: api лише enqueue resume-job — граф ганяє worker.
  r.post("/runs/:id/decision", requirePermission("decision:make"), decisions.run);
  r.post("/content-items/:id/decision", requirePermission("decision:make"), decisions.item);

  // Людське редагування постів + версії (§content-editing). edit/revert — content:edit (правка
  // вмісту, не workflow-рішення); versions — read, без гварда (будь-який член акаунта).
  r.patch("/content-items/:id", requirePermission("content:edit"), contentItems.edit);
  r.get("/content-items/:id/versions", contentItems.versions);
  r.post("/content-items/:id/revert", requirePermission("content:edit"), contentItems.revert);

  // Нотифікації + Inbox (§2.13) — персональний фід, без RBAC-гварда (див. коментар вище)
  r.get("/notifications", notifications.list);
  r.post("/notifications/:id/read", notifications.markRead);
  r.post("/notifications/read-all", notifications.markAllRead);
  r.get("/inbox", notifications.inbox);
  r.post("/inbox/:id/resolve", notifications.resolveInbox);

  // BYOK (§ADR-0016): ключі провайдерів акаунта. list — статус для будь-якого члена; set/remove —
  // лише owner/admin (apikey:manage). Provider у path (openai|anthropic), ключ у тілі.
  r.get("/api-keys", apiKeys.list);
  r.put("/api-keys/:provider", requirePermission("apikey:manage"), apiKeys.set);
  r.delete("/api-keys/:provider", requirePermission("apikey:manage"), apiKeys.remove);

  // Планувальник (§2.11): слоти плану окремо від прогонів. Усі мутації — plan:write.
  r.get("/companies/:companyId/plan-entries", planner.list);
  r.post("/companies/:companyId/plan/materialize", requirePermission("plan:write"), planner.materialize);
  r.post("/companies/:companyId/plan/suggest-topics", requirePermission("plan:write"), planner.suggestTopics);
  r.patch("/plan-entries/:id", requirePermission("plan:write"), planner.patch);
  r.post("/plan-entries/approve", requirePermission("plan:write"), planner.approve);

  return r;
}
