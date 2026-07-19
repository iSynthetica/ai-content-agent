import type { Logger } from "pino";
import { AppError } from "../http/errors";
import type { AfterCommit, AuthCtx, PageParams, Paged } from "../di/types";
import type {
  CompaniesRepo,
  Company,
  CompanyPatch,
  NewCompany,
  RunsRepo,
} from "../repositories/interfaces";

// Бізнес-логіка компаній + bootstrap-тригер (spike-2 §2.9, §2.12). Контролер тонкий; тут — скоуп,
// guard-и, enqueue через after-commit-хук. Порт черги НЕ в конструкторі — приходить у хук зі
// свіжого PostCommitScope (enqueue завжди ПІСЛЯ COMMIT, §4.1).
export class CompaniesService {
  constructor(
    private readonly companies: CompaniesRepo,
    private readonly runs: RunsRepo,
    private readonly afterCommit: AfterCommit,
    private readonly logger: Logger,
  ) {}

  async create(ctx: AuthCtx, data: NewCompany): Promise<Company> {
    return this.companies.create(ctx.accountId, data);
  }

  async list(ctx: AuthCtx, page: PageParams): Promise<Paged<Company>> {
    return this.companies.list(ctx.accountId, page);
  }

  async get(ctx: AuthCtx, id: string): Promise<Company> {
    const company = await this.companies.findById(ctx.accountId, id);
    if (!company) throw AppError.notFound("company");
    return company;
  }

  async update(ctx: AuthCtx, id: string, patch: CompanyPatch): Promise<Company> {
    const updated = await this.companies.update(ctx.accountId, id, patch);
    if (!updated) throw AppError.notFound("company");
    return updated;
  }

  // DELETE (§2.9): guard на активні runs → 409; далі фізичний DELETE (FK CASCADE у схемі).
  // Ідемпотентно: неіснуюча компанія → { ok: true } без помилки.
  async remove(ctx: AuthCtx, id: string): Promise<{ ok: true }> {
    const company = await this.companies.findById(ctx.accountId, id);
    if (!company) return { ok: true };
    const active = await this.runs.countActiveByCompany(ctx.accountId, id);
    if (active > 0) throw AppError.conflict("company has active runs");
    await this.companies.delete(ctx.accountId, id);
    return { ok: true };
  }

  // POST /v1/companies/:id/bootstrap (§2.12): guard джерела → enqueue enrichment-job ПІСЛЯ COMMIT.
  // jobId детермінований → ідемпотентний повторний виклик (BullMQ-dedup).
  async bootstrap(ctx: AuthCtx, companyId: string): Promise<{ jobId: string }> {
    const company = await this.companies.findById(ctx.accountId, companyId);
    if (!company) throw AppError.notFound("company");
    if (!company.websiteUrl && !company.description) {
      throw AppError.unprocessable("bootstrap requires websiteUrl or description");
    }
    const jobId = `bootstrap:${companyId}`;
    this.afterCommit(async ({ ports, logger }) => {
      try {
        await ports.queue.enqueueBootstrap({ accountId: ctx.accountId, companyId });
        logger.info({ companyId, jobId }, "bootstrap enqueued");
      } catch (err) {
        // best-effort (§2.12): втрата bootstrap-job некритична; лог + (Фаза 3) нотифікація on-fail.
        logger.error({ companyId, err }, "bootstrap enqueue failed after commit");
      }
    });
    return { jobId };
  }

  /**
   * GET /v1/companies/:id/bootstrap (§2.12) — статус для полінгу з візарда.
   *
   * Читається РЕАЛЬНИЙ стан job із companies.bootstrap_status. Раніше він деривувався із
   * заповненості полів, і три різні ситуації виглядали однаково: «ніколи не запускали»,
   * «працює просто зараз» і «впало». Візард через це не міг показати ні прогрес, ні помилку —
   * лише вічний спінер.
   */
  async bootstrapStatus(
    ctx: AuthCtx,
    companyId: string,
  ): Promise<{
    status: "idle" | "pending" | "running" | "done" | "failed";
    error?: string | null;
    profile?: Record<string, unknown>;
  }> {
    const company = await this.companies.findById(ctx.accountId, companyId);
    if (!company) throw AppError.notFound("company");
    const state = await this.companies.getBootstrapState(ctx.accountId, companyId);

    const raw = state?.status ?? null;
    // NULL означає, що bootstrap не запускали. Це не «pending»: візард має показати кнопку,
    // а не крутилку очікування задачі, якої в черзі немає.
    const status = raw === null || raw === undefined ? "idle" : (raw as "pending" | "running" | "done" | "failed");

    if (status === "failed") return { status, error: state?.error ?? null };
    if (status !== "done") return { status };

    return {
      status,
      profile: {
        positioning: company.positioning,
        stack: company.stack,
        services: company.services,
        audience: company.audience,
      },
    };
  }
}
