// Ярус запиту (spike-2 §2.1, §4.1): будується НА КОЖЕН запит поверх request-scoped tx з уже
// виставленим SET LOCAL app.current_* (§2.10.3). Репо/сервіси живуть одну транзакцію (НЕ синглтони).
import type { Logger } from "pino";
import type { AfterCommit, AuthCtx, DbExecutor, Ports } from "./types";
import type { Repos } from "../repositories/interfaces";

import { DrizzleAccountsRepo } from "../repositories/accounts.repo";
import { DrizzleCompaniesRepo } from "../repositories/companies.repo";
import { DrizzleSettingsRepo } from "../repositories/settings.repo";
import { DrizzleApiKeysRepo } from "../repositories/api-keys.repo";
import { DrizzleContentPlansRepo } from "../repositories/content-plans.repo";
import { DrizzlePlanEntriesRepo } from "../repositories/plan-entries.repo";
import { DrizzleRunsRepo } from "../repositories/runs.repo";
import { DrizzleContentItemsRepo } from "../repositories/content-items.repo";
import { DrizzleContentItemVersionsRepo } from "../repositories/content-item-versions.repo";
import { DrizzleInboxRepo, DrizzleNotificationsRepo } from "../repositories/notifications.repo";
import { DrizzleTopicDraftsRepo } from "../repositories/topic-drafts.repo";
import { DrizzleRunConfigPresetsRepo } from "../repositories/run-config-presets.repo";
import { DrizzleMembersRepo } from "../repositories/members.repo";
import { DrizzleServiceConnectionsRepo } from "../repositories/service-connections.repo";
import { DrizzlePublicationsRepo } from "../repositories/publications.repo";

import { AccountsService } from "../services/accounts.service";
import { CompaniesService } from "../services/companies.service";
import { SettingsService } from "../services/settings.service";
import { ContentPlansService } from "../services/content-plans.service";
import { OnboardingService } from "../services/onboarding.service";
import { RunsService } from "../services/runs.service";
import { ContentItemsService } from "../services/content-items.service";
import { NotificationsFeedService } from "../services/notifications-feed.service";
import { PlannerService } from "../services/planner.service";
import { ApiKeysService } from "../services/api-keys.service";
import { RunTopicDraftsService } from "../services/run-topic-drafts.service";
import { RunConfigPresetsService } from "../services/run-config-presets.service";
import { MembersService } from "../services/members.service";
import { ConnectionsService } from "../services/connections.service";
import { PublicationsService } from "../services/publications.service";
import type { AppConfig } from "../config/env";
import type { Auth } from "../auth/better-auth";
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
  apiKeys: ApiKeysService;
  runTopicDrafts: RunTopicDraftsService;
  runConfigPresets: RunConfigPresetsService;
  members: MembersService;
  connections: ConnectionsService;
  publications: PublicationsService;
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
    apiKeys: new DrizzleApiKeysRepo(tx),
    runs: new DrizzleRunsRepo(tx),
    contentItems: new DrizzleContentItemsRepo(tx),
    contentItemVersions: new DrizzleContentItemVersionsRepo(tx),
    notifications: new DrizzleNotificationsRepo(tx),
    inbox: new DrizzleInboxRepo(tx),
    topicDrafts: new DrizzleTopicDraftsRepo(tx),
    runConfigPresets: new DrizzleRunConfigPresetsRepo(tx),
    members: new DrizzleMembersRepo(tx),
    serviceConnections: new DrizzleServiceConnectionsRepo(tx),
    publications: new DrizzlePublicationsRepo(tx),
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
  masterKey: Buffer,
  authInstance: Auth, // better-auth (§RBAC member-mgmt): провіженінг ba_user при «додати члена»
  config: AppConfig, // §publishing: ConnectionsService читає OAuth-реєстр + секрети cookie з env
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
      repos.planEntries,
      repos.contentItems,
      repos.apiKeys,
      afterCommit,
      logger,
    ),
    // per-item HITL (§7): чіпає contentItems (статус) + runs (getForDecision для rerun-resume) +
    // afterCommit (enqueue resume на свіжому PostCommitScope, §2.10.3).
    feed: new NotificationsFeedService(repos.notifications, repos.inbox),
    planner: new PlannerService(repos.planEntries, repos.contentPlans, repos.companies, afterCommit),
    contentItems: new ContentItemsService(
      repos.contentItems,
      repos.runs,
      repos.contentItemVersions,
      afterCommit,
      logger,
    ),
    notifications,
    // BYOK: шифрування ключів компанії master-ключем застосунку (§ADR-0016/per-company-settings).
    // companies — для звірки приналежності компанії акаунту (companyId приходить із path).
    apiKeys: new ApiKeysService(repos.apiKeys, repos.companies, masterKey),
    // Topic preview (§runtopics): AI-підбір тем ДО генерації — окремий сервіс від planner
    // (немає content_plan/plan_entries) і від RunsService (не запускає прогін, лише пропонує теми).
    runTopicDrafts: new RunTopicDraftsService(
      repos.topicDrafts,
      repos.companies,
      repos.settings,
      repos.apiKeys,
      afterCommit,
      logger,
    ),
    // Named-конфіги прогону (§Phase 5): тонкий CRUD поверх run_config_presets (RLS-ізольовано).
    runConfigPresets: new RunConfigPresetsService(repos.runConfigPresets, repos.companies),
    // Керування членами акаунта (§RBAC member-mgmt F2): активує наявний RBAC. auth — для провіженінгу.
    members: new MembersService(repos.members, authInstance, logger),
    // Підключення соцмереж/Telegram (§publishing §3): шифрує токени master-ключем; OAuth-реєстр і
    // секрети cookie бере з config. HTTP-обмін — у контролері ПОЗА txn.
    connections: new ConnectionsService(repos.serviceConnections, repos.companies, masterKey, config),
    // Публікація схвалених постів (§publishing §3): валідує + pending + after-commit enqueuePublish.
    publications: new PublicationsService(
      repos.publications,
      repos.runs,
      repos.contentItems,
      afterCommit,
      logger,
    ),
  };

  return { auth, afterCommit, repos, services };
}
