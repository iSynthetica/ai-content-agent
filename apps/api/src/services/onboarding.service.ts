import { contentPlanConfig } from "@forteq/shared";
import type { AuthCtx } from "../di/types";
import type {
  CompaniesRepo,
  ContentPlansRepo,
  SettingsRepo,
} from "../repositories/interfaces";

// Дефолтний config плану — беремо валідовані дефолти контракту (topicMode/horizon/auto*).
// contentPlanConfig.parse({}) дає стабільну форму без хардкоду в api.
const DEFAULT_PLAN_CONFIG = contentPlanConfig.parse({}) as Record<string, unknown>;

export interface OnboardInput {
  name: string;
  websiteUrl?: string;
  description?: string;
}

// POST /v1/onboarding (§2.12): мінімальні поля. Атомарно (одна request-txn openScope): company +
// порожні settings + content_plans з дефолтним config. bootstrap-enrichment — ОКРЕМА дія
// (CompaniesService.bootstrap), не гілка створення. Знімає guard «неналаштована компанія» (§4.4).
export class OnboardingService {
  constructor(
    private readonly companies: CompaniesRepo,
    private readonly settings: SettingsRepo,
    private readonly contentPlans: ContentPlansRepo,
  ) {}

  async onboard(ctx: AuthCtx, input: OnboardInput): Promise<{ companyId: string }> {
    const company = await this.companies.create(ctx.accountId, {
      name: input.name,
      websiteUrl: input.websiteUrl ?? null,
      description: input.description ?? null,
      stack: [],
      services: [],
    });
    // Порожні settings (DB-дефолти: language 'uk', provider 'openai', порожні масиви).
    await this.settings.upsert(ctx.accountId, company.id, {});
    // Дефолтний план (channelCounts — DB-дефолт; config — валідовані дефолти контракту).
    await this.contentPlans.create(ctx.accountId, company.id, { config: DEFAULT_PLAN_CONFIG });
    return { companyId: company.id };
  }
}
