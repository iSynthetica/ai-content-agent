import type { Logger } from "pino";
import type { DecisionRequest } from "@forteq/shared";
import { AppError } from "../http/errors";
import type { AfterCommit, AuthCtx } from "../di/types";
import type { ContentItem, ContentItemsRepo, RunsRepo } from "../repositories/interfaces";

// ContentItemsService — per-item HITL-рішення (§7, POST /v1/content-items/:id/decision).
// Тверда межа (§11): api граф НЕ ганяє.
//  • approve/reject — прямий workflow-статус айтема (approved/rejected) у scoped-txn, БЕЗ resume/графа.
//  • rerun — item-rerun = resume НАЯВНОГО прогону (той самий threadId, живий checkpointer, §7):
//      api лише ставить айтем у needs_revision + enqueue `generation.resume`; worker деривує itemIds
//      з БД (status='needs_revision', B2) і перегенерує саме цей пост (Writer→Reviewer).
export class ContentItemsService {
  constructor(
    private readonly items: ContentItemsRepo,
    private readonly runs: RunsRepo,
    private readonly afterCommit: AfterCommit,
    private readonly logger: Logger,
  ) {}

  async decideItem(
    ctx: AuthCtx,
    itemId: string,
    decision: DecisionRequest,
  ): Promise<ContentItem> {
    const item = await this.items.findById(ctx.accountId, itemId);
    if (!item) throw AppError.notFound("content item");

    const { action, feedback } = decision;

    // approve/reject — термінальне людське рішення по айтему: лише БД, без графа (дефолт МВП §7).
    if (action === "approve" || action === "reject") {
      const status = action === "approve" ? "approved" : "rejected";
      const updated = await this.items.updateStatus(ctx.accountId, itemId, status);
      if (!updated) throw AppError.notFound("content item");
      return updated;
    }

    // rerun — resume наявного графа з живим threadId. Дозволено ЛИШЕ з needs_review (§7.1):
    // queued/running → worker ще активний (гонка); термінальні → thread міг бути зібраний.
    const run = await this.runs.getForDecision(ctx.accountId, item.runId);
    if (!run) throw AppError.notFound("run");
    if (run.status !== "needs_review") {
      throw run.status === "queued" || run.status === "running"
        ? AppError.conflict("run is not awaiting review")
        : AppError.conflict("run is finalized");
    }
    if (!run.threadId) throw AppError.unprocessable("run has no resumable thread");

    const threadId = run.threadId;
    const companyId = run.companyId;
    const runId = item.runId;

    // Мета ревізії — саме цей айтем: ставимо needs_revision, щоб worker вибрав його з БД як itemIds
    // (job-контракт itemIds поки не несе — worker деривує зі стану, B2). Return — оновлений айтем.
    const updated = await this.items.updateStatus(ctx.accountId, itemId, "needs_revision");
    if (!updated) throw AppError.notFound("content item");

    // enqueue СТРОГО після COMMIT (after-commit-хук на свіжому PostCommitScope, §2.10.3).
    this.afterCommit(async ({ ports, logger }) => {
      try {
        await ports.queue.enqueueRun({
          runId,
          accountId: ctx.accountId,
          companyId,
          threadId,
          mode: "resume",
          resume: { action: "rerun", feedback },
        });
        logger.info({ itemId, runId }, "item rerun resume enqueued");
      } catch (err) {
        // Рішення вже закоммічене; enqueue впав → resume-sweep довершить (§2.7.2). У МВП — best-effort.
        logger.error({ itemId, runId, err }, "item rerun resume enqueue failed after commit");
      }
    });

    return updated;
  }
}
