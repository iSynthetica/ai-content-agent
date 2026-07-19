import { AppError } from "../http/errors";
import type { AuthCtx } from "../di/types";
import type {
  CompaniesRepo,
  ContentPlan,
  ContentPlansRepo,
} from "../repositories/interfaces";

// Вхід PUT /content-plan: channelCounts + частковий config (merge, не replace, §2.11).
export interface UpsertPlanInput {
  channelCounts?: Record<string, number>;
  config?: Record<string, unknown>;
}

// content_plans — гнучкий config (cadence/pillars/topicMode/horizon). МВП: єдиний план компанії.
export class ContentPlansService {
  constructor(
    private readonly plans: ContentPlansRepo,
    private readonly companies: CompaniesRepo,
  ) {}

  async get(ctx: AuthCtx, companyId: string): Promise<ContentPlan> {
    await this.ensureCompany(ctx, companyId);
    const plan = await this.plans.getByCompany(ctx.accountId, companyId);
    if (!plan) throw AppError.notFound("content-plan");
    return plan;
  }

  // Upsert: створює план, якщо його ще немає; інакше merge config поверх наявного (§2.11).
  async upsert(ctx: AuthCtx, companyId: string, input: UpsertPlanInput): Promise<ContentPlan> {
    await this.ensureCompany(ctx, companyId);
    const existing = await this.plans.getByCompany(ctx.accountId, companyId);

    if (!existing) {
      return this.plans.create(ctx.accountId, companyId, {
        channelCounts: input.channelCounts,
        config: input.config ?? null,
      });
    }

    const mergedConfig = input.config
      ? { ...(existing.config ?? {}), ...input.config }
      : existing.config;
    const updated = await this.plans.updateById(ctx.accountId, existing.id, {
      channelCounts: input.channelCounts ?? existing.channelCounts,
      config: mergedConfig,
    });
    if (!updated) throw AppError.notFound("content-plan");
    return updated;
  }

  private async ensureCompany(ctx: AuthCtx, companyId: string): Promise<void> {
    const company = await this.companies.findById(ctx.accountId, companyId);
    if (!company) throw AppError.notFound("company");
  }
}
