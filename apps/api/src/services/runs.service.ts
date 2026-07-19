import { randomUUID } from "node:crypto";
import type { Logger } from "pino";
import type { DecisionRequest, RunDecisionResponse } from "@forteq/shared";
import { AppError } from "../http/errors";
import { serializeRun, type ExportedFile, type ExportFormat } from "../lib/export";
import { snapshotModelConfig } from "../lib/model-config";
import type { AfterCommit, AuthCtx, Paged } from "../di/types";
import type {
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
    const modelConfig = snapshotModelConfig(settings, plan);

    // INSERT run у request-txn (§2.10.3). planEntryIds передаються у job як є.
    // TODO(Фаза 3/4, планувальник): валідувати належність слотів компанії + статус 'approved'
    //   і перевести їх scheduled→generating (потребує PlanEntriesRepo — поза скоупом Фази 1).
    const run = await this.runs.create({
      accountId: ctx.accountId,
      companyId,
      status: "queued",
      trigger: "manual",
      scheduledFor: null,
      modelConfig,
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
