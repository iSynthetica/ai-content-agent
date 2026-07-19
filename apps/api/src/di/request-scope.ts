// Ярус запиту (spike-2 §2.1, §4.1): будується НА КОЖЕН запит поверх request-scoped tx з уже
// виставленим SET LOCAL app.current_* (§2.10.3). Репо/сервіси живуть одну транзакцію (НЕ синглтони).
import type { Logger } from "pino";
import type { AfterCommit, AuthCtx, DbExecutor, Ports } from "./types";
import type { Repos } from "../repositories/interfaces";

import { DrizzleAccountsRepo } from "../repositories/accounts.repo";
import { DrizzleCompaniesRepo } from "../repositories/companies.repo";
import { DrizzleSettingsRepo } from "../repositories/settings.repo";
import { DrizzleContentPlansRepo } from "../repositories/content-plans.repo";
import { DrizzlePlanEntriesRepo } from "../repositories/plan-entries.repo";
import { DrizzleRunsRepo } from "../repositories/runs.repo";
import { DrizzleContentItemsRepo } from "../repositories/content-items.repo";
import { DrizzleInboxRepo, DrizzleNotificationsRepo } from "../repositories/notifications.repo";

import { AccountsService } from "../services/accounts.service";
import { CompaniesService } from "../services/companies.service";
import { SettingsService } from "../services/settings.service";
import { ContentPlansService } from "../services/content-plans.service";
import { OnboardingService } from "../services/onboarding.service";
import { RunsService } from "../services/runs.service";
import { ContentItemsService } from "../services/content-items.service";
import { NotificationsFeedService } from "../services/notifications-feed.service";
import { PlannerService } from "../services/planner.service";
import {
  NotificationServiceImpl,
  type NotificationService,
} from "../services/notification.service";

export interface Services {
  accounts: AccountsService;
  companies: CompaniesService;
  settings: SettingsService;
  contentPlans: ContentPlansService;
  onboarding: OnboardingService;
  runs: RunsService;
  contentItems: ContentItemsService;
  notifications: NotificationService;
  feed: NotificationsFeedService;
  planner: PlannerService;
}

export interface RequestScope {
  auth: AuthCtx;
  afterCommit: AfterCommit;
  repos: Repos;
  services: Services;
}

// Єдина фабрика репо на переданому tx — реюзається request-scope І after-commit-хуками (§4.1).
export function buildRepos(tx: DbExecutor): Repos {
  return {
    accounts: new DrizzleAccountsRepo(tx),
    companies: new DrizzleCompaniesRepo(tx),
    settings: new DrizzleSettingsRepo(tx),
    contentPlans: new DrizzleContentPlansRepo(tx),
    planEntries: new DrizzlePlanEntriesRepo(tx),
    runs: new DrizzleRunsRepo(tx),
    contentItems: new DrizzleContentItemsRepo(tx),
    notifications: new DrizzleNotificationsRepo(tx),
    inbox: new DrizzleInboxRepo(tx),
  };
}

// Будує повний request-scope: репо на tx + сервіси, що їх агрегують. enqueue-шлях НЕ тримає
// QueuePort у конструкторах сервісів — черга приходить у after-commit-хук зі свіжого scope (§4.1).
export function buildRequestScope(
  tx: DbExecutor,
  auth: AuthCtx,
  afterCommit: AfterCommit,
  _ports: Ports,
  logger: Logger,
): RequestScope {
  const repos = buildRepos(tx);
  // NotificationService — реальна реалізація (Фаза 3, B11a): пише у notifications/inbox_items
  // під тим самим RLS-скоупом, що й решта репо цього запиту.
  const notifications = new NotificationServiceImpl(repos.notifications, repos.inbox, logger);

  const services: Services = {
    accounts: new AccountsService(repos.accounts, repos.companies),
    companies: new CompaniesService(repos.companies, repos.runs, afterCommit, logger),
    settings: new SettingsService(repos.settings, repos.companies),
    contentPlans: new ContentPlansService(repos.contentPlans, repos.companies),
    onboarding: new OnboardingService(repos.companies, repos.settings, repos.contentPlans),
    runs: new RunsService(
      repos.runs,
      repos.companies,
      repos.settings,
      repos.contentPlans,
      repos.contentItems,
      afterCommit,
      logger,
    ),
    // per-item HITL (§7): чіпає contentItems (статус) + runs (getForDecision для rerun-resume) +
    // afterCommit (enqueue resume на свіжому PostCommitScope, §2.10.3).
    feed: new NotificationsFeedService(repos.notifications, repos.inbox),
    planner: new PlannerService(repos.planEntries, repos.contentPlans, repos.companies, afterCommit),
    contentItems: new ContentItemsService(repos.contentItems, repos.runs, afterCommit, logger),
    notifications,
  };

  return { auth, afterCommit, repos, services };
}
