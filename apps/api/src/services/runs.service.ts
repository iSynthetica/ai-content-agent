import { randomUUID } from "node:crypto";
import type { Logger } from "pino";
import {
  AGENT_MODEL_KEYS,
  CHANNELS,
  CHANNEL_DEFAULTS,
  MAX_POSTS_PER_RUN,
  type AgentModels,
  type Channel,
  type DecisionRequest,
  type RunDecisionResponse,
} from "@forteq/shared";
import { AppError } from "../http/errors";
import { serializeRun, type ExportedFile, type ExportFormat } from "../lib/export";
import { snapshotModelConfig } from "../lib/model-config";
import type { AfterCommit, AuthCtx, Paged } from "../di/types";
import type {
  ApiKeysRepo,
  CompaniesRepo,
  ContentItem,
  ContentItemsRepo,
  ContentPlansRepo,
  ItemsQuery,
  RunListFilter,
  RunsRepo,
  RunSummary,
  SettingsRepo,
} from "../repositories/interfaces";

export interface CreateRunInput {
  planEntryIds?: string[];
  channels?: string[];
  counts?: Record<string, number>;
  topics?: Array<{ channel: string; topic: string; keyMessage?: string; seoKeywords?: string[] }>;
  angle?: string;
  agentModels?: Record<string, { provider: string; model: string }> | null;
  saveAsDefault?: boolean;
}
// Результат створення: runId + мутабельний outcome, який after-commit-хук виставляє на pending,
// якщо enqueue впав ПІСЛЯ COMMIT (контролер тоді віддає 202 замість 201, §2.7.1).
export interface CreateRunResult {
  runId: string;
  outcome: { enqueue: "ok" | "pending" };
}

// RunsService — створення прогону + enqueue (тверда межа: api граф НЕ ганяє, §2.7).
// enqueue РЕЄСТРУЄТЬСЯ як after-commit-хук і виконується на свіжому PostCommitScope ПІСЛЯ COMMIT
// request-txn (§2.10.3, §4.1), щоб worker не взяв job до появи рядка.
export class RunsService {
  constructor(
    private readonly runs: RunsRepo,
    private readonly companies: CompaniesRepo,
    private readonly settings: SettingsRepo,
    private readonly plans: ContentPlansRepo,
    private readonly contentItems: ContentItemsRepo,
    private readonly apiKeys: ApiKeysRepo,
    private readonly afterCommit: AfterCommit,
    private readonly logger: Logger,
  ) {}

  async createRun(ctx: AuthCtx, companyId: string, input: CreateRunInput): Promise<CreateRunResult> {
    const company = await this.companies.findById(ctx.accountId, companyId);
    if (!company) throw AppError.notFound("company");

    const settings = await this.settings.getByCompany(ctx.accountId, companyId);
    const plan = await this.plans.getByCompany(ctx.accountId, companyId);
    // Guard передумов (§4.4): без settings/plan знімок конфігурації був би порожній → run без сенсу.
    if (!settings || !plan) {
      throw AppError.unprocessable(
        "company is not configured: settings and content-plan are required before a run",
      );
    }

    const threadId = randomUUID();
    const scoped = (input.planEntryIds?.length ?? 0) > 0;

    // Per-run моделі: override виграє над збереженими (null явно скидає у легасі); undefined = «як є».
    const effectiveAgentModels =
      input.agentModels !== undefined ? input.agentModels : (settings.agentModels ?? null);

    // Режим явних тем (Phase 2): рівно ці теми → fan-out; лічильники деривуємо з тем.
    const provided = !scoped && (input.topics?.length ?? 0) > 0;

    // Per-run лічильники (ad-hoc/provided; для scoped к-сть визначають обрані слоти).
    // Guardrail: сумарно ≤ MAX_POSTS_PER_RUN.
    let counts: Record<string, number> | undefined;
    if (provided) {
      counts = {};
      for (const t of input.topics!) counts[t.channel] = (counts[t.channel] ?? 0) + 1;
      if (input.topics!.length > MAX_POSTS_PER_RUN) {
        throw AppError.unprocessable(
          `Забагато тем (${input.topics!.length}); максимум ${MAX_POSTS_PER_RUN} на один прогін`,
        );
      }
    } else if (!scoped) {
      const src = input.counts ?? (plan.channelCounts as Record<string, number>) ?? {};
      const chans = (input.channels ?? CHANNELS.filter((c) => (src[c] ?? 0) > 0)) as string[];
      counts = {};
      for (const ch of chans) counts[ch] = src[ch] ?? CHANNEL_DEFAULTS[ch as Channel] ?? 1;
      const total = Object.values(counts).reduce((a, b) => a + b, 0);
      if (total === 0) throw AppError.unprocessable("Оберіть хоча б один канал із постами");
      if (total > MAX_POSTS_PER_RUN) {
        throw AppError.unprocessable(
          `Забагато постів (${total}); максимум ${MAX_POSTS_PER_RUN} на один прогін`,
        );
      }
    }

    const modelConfig = snapshotModelConfig(settings, plan, {
      channelCounts: counts,
      agentModels: effectiveAgentModels,
    });

    // BYOK (§ADR-0016/0017): union провайдерів ПО ФАКТИЧНІЙ конфігурації цього прогону (per-run
    // override або фолбек-provider для кожного текстового слота), плюс OpenAI для зображень, якщо в
    // прогоні є Instagram. Без ключа будь-якого з них — миттєвий 422 (воркер блокує повторно).
    const requiredProviders = new Set<string>();
    for (const slot of AGENT_MODEL_KEYS) {
      requiredProviders.add(effectiveAgentModels?.[slot]?.provider ?? settings.provider);
    }
    const hasInstagram = scoped || (counts?.instagram ?? 0) > 0;
    if (hasInstagram) requiredProviders.add("openai"); // зображення завжди OpenAI (gpt-image-1)
    for (const provider of requiredProviders) {
      if (!(await this.apiKeys.exists(ctx.accountId, provider))) {
        throw AppError.unprocessable(
          `Додайте API-ключ провайдера '${provider}' у налаштуваннях акаунта, щоб запускати генерацію`,
        );
      }
    }

    // Знімок конфігурації для показу на сторінці прогону (§spec 08).
    const runConfig: Record<string, unknown> = {
      channels: counts ? Object.keys(counts) : [],
      counts: counts ?? {},
      topics: input.topics ?? null, // явні теми (Phase 2) — воркер робить fan-out рівно на них
      angle: input.angle ?? null,
      provider: settings.provider,
      models: settings.models ?? null,
      agentModels: effectiveAgentModels ?? null,
      scoped,
    };

    // Опційно: зберегти обране як дефолт компанії (лише ad-hoc — counts мають сенс поза scoped).
    if (input.saveAsDefault && !scoped) {
      if (counts) await this.plans.updateById(ctx.accountId, plan.id, { channelCounts: counts });
      // Провайдери валідовано enum'ом у контракті/збережені з валідних; звужуємо до типу патча.
      await this.settings.upsert(ctx.accountId, companyId, {
        agentModels: effectiveAgentModels as AgentModels | null,
      });
    }

    // INSERT run у request-txn (§2.10.3). planEntryIds передаються у job як є.
    const run = await this.runs.create({
      accountId: ctx.accountId,
      companyId,
      status: "queued",
      trigger: "manual",
      scheduledFor: null,
      modelConfig,
      runConfig,
      threadId,
      createdBy: ctx.userId,
    });

    const outcome: CreateRunResult["outcome"] = { enqueue: "ok" };
    const planEntryIds = input.planEntryIds;

    this.afterCommit(async ({ ports, logger }) => {
      try {
        await ports.queue.enqueueRun({
          runId: run.id,
          accountId: ctx.accountId,
          companyId,
          threadId,
          mode: "generate",
          planEntryIds,
        });
        logger.info({ runId: run.id }, "run enqueued");
      } catch (err) {
        // Run уже закоммічено; enqueue впав → 202 + enqueue:'pending' (§2.7.1). Без orphan/5xx-втрати.
        // TODO(Фаза 3, worker): reconciliation-sweep потребує службових колонок outbox
        //   (generation_runs.enqueued_at) — їх немає у frozen-схемі; поки best-effort.
        outcome.enqueue = "pending";
        logger.error({ runId: run.id, err }, "run enqueue failed after commit");
      }
    });

    return { runId: run.id, outcome };
  }

  async list(
    ctx: AuthCtx,
    companyId: string,
    filter: RunListFilter,
  ): Promise<Paged<RunSummary>> {
    const company = await this.companies.findById(ctx.accountId, companyId);
    if (!company) throw AppError.notFound("company");
    return this.runs.listByCompany(ctx.accountId, companyId, filter);
  }

  async get(ctx: AuthCtx, id: string): Promise<RunSummary> {
    const run = await this.runs.findById(ctx.accountId, id);
    if (!run) throw AppError.notFound("run");
    return run;
  }

  async items(ctx: AuthCtx, runId: string, query: ItemsQuery): Promise<ContentItem[]> {
    const run = await this.runs.findById(ctx.accountId, runId);
    if (!run) throw AppError.notFound("run");
    return this.contentItems.listByRun(ctx.accountId, runId, query);
  }

  // Вивантаження пакета (FR-10.1/10.2, GET /v1/runs/:id/export). Читання під тим самим RLS-скоупом,
  // що і решта: 404 для чужого прогону дає той самий шлях, а не окрема перевірка.
  // Серіалізація — чисті функції з lib/export (тестуються без БД).
  async exportRun(ctx: AuthCtx, runId: string, format: ExportFormat): Promise<ExportedFile> {
    const run = await this.runs.findById(ctx.accountId, runId);
    if (!run) throw AppError.notFound("run");
    const items = await this.contentItems.listByRun(ctx.accountId, runId, {});
    return serializeRun(run, items, format);
  }

  // HITL-рішення по прогону (§7, POST /v1/runs/:id/decision — approve|reject|rerun).
  // Тверда межа: api граф НЕ ганяє — лише enqueue `generation.resume` у after-commit-хук; worker
  // (resume.ts) відновить граф з checkpointer-стану і зробить фінальний персист (status/айтеми).
  // Дозволено ЛИШЕ з `needs_review` (§7.1); інакше 409 (compare-and-set під FOR UPDATE у getForDecision).
  async decideRun(
    ctx: AuthCtx,
    runId: string,
    decision: DecisionRequest,
  ): Promise<RunDecisionResponse> {
    const run = await this.runs.getForDecision(ctx.accountId, runId);
    if (!run) throw AppError.notFound("run");
    // Guard стан-машини (§7.1): approve/reject/rerun — лише поки run чекає рішення людини.
    if (run.status !== "needs_review") {
      throw run.status === "queued" || run.status === "running"
        ? AppError.conflict("run is not awaiting review")
        : AppError.conflict("run is finalized");
    }
    // Живий thread обовʼязковий для resume; для needs_review він завжди виставлений worker'ом.
    if (!run.threadId) throw AppError.unprocessable("run has no resumable thread");

    const threadId = run.threadId;
    const companyId = run.companyId;
    const { action, feedback } = decision;

    // Оптимістично рухаємо status→running (щоб UI одразу показав рух); worker при resume також
    // виставить running (ідемпотентно), а далі — фінальний статус за результатом графа (§7.1).
    await this.runs.updateStatus(ctx.accountId, runId, "running");

    // enqueue СТРОГО після COMMIT request-txn (after-commit-хук на свіжому PostCommitScope, §2.10.3).
    this.afterCommit(async ({ ports, logger }) => {
      try {
        await ports.queue.enqueueRun({
          runId,
          accountId: ctx.accountId,
          companyId,
          threadId,
          mode: "resume",
          resume: { action, feedback },
        });
        logger.info({ runId, action }, "run decision resume enqueued");
      } catch (err) {
        // Рішення вже закоммічене; enqueue впав → resume-sweep довершить (§2.7.2). У МВП — best-effort.
        logger.error({ runId, err }, "run decision resume enqueue failed after commit");
      }
    });

    return { runId, status: "running" };
  }
}
