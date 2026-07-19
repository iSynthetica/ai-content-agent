import { AppError } from "../http/errors";
import type { AuthCtx } from "../di/types";
import type {
  CompaniesRepo,
  CompanySettings,
  SettingsPatch,
  SettingsRepo,
} from "../repositories/interfaces";

// company_settings — бренд + дефолти генерації (1:1 до company). Guard: компанія мусить існувати
// в акаунті (§2.2 — скоуп у сервісі поверх RLS).
export class SettingsService {
  constructor(
    private readonly settings: SettingsRepo,
    private readonly companies: CompaniesRepo,
  ) {}

  async get(ctx: AuthCtx, companyId: string): Promise<CompanySettings> {
    await this.ensureCompany(ctx, companyId);
    const settings = await this.settings.getByCompany(ctx.accountId, companyId);
    if (!settings) throw AppError.notFound("settings");
    return settings;
  }

  async upsert(ctx: AuthCtx, companyId: string, patch: SettingsPatch): Promise<CompanySettings> {
    await this.ensureCompany(ctx, companyId);
    return this.settings.upsert(ctx.accountId, companyId, patch);
  }

  private async ensureCompany(ctx: AuthCtx, companyId: string): Promise<void> {
    const company = await this.companies.findById(ctx.accountId, companyId);
    if (!company) throw AppError.notFound("company");
  }
}
