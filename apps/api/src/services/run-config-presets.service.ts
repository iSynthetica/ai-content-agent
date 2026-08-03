import { runPresetConfig, type RunPresetDTO } from "@forteq/shared";
import { AppError } from "../http/errors";
import type { AuthCtx } from "../di/types";
import type { CompaniesRepo, RunConfigPresetsRepo } from "../repositories/interfaces";

// Run-config пресети (§Phase 5): named-конфіг прогону для переюзу. Тонкий сервіс — валідація config
// схемою @forteq/shared, перевірка приналежності компанії, мапінг дубля імені у 409.
export class RunConfigPresetsService {
  constructor(
    private readonly presets: RunConfigPresetsRepo,
    private readonly companies: CompaniesRepo,
  ) {}

  async list(ctx: AuthCtx, companyId: string): Promise<{ items: RunPresetDTO[] }> {
    await this.assertCompany(ctx, companyId);
    const rows = await this.presets.listByCompany(ctx.accountId, companyId);
    return { items: rows.map((r) => ({ ...r, config: runPresetConfig.parse(r.config) })) };
  }

  async create(
    ctx: AuthCtx,
    companyId: string,
    input: { name: string; config: unknown },
  ): Promise<RunPresetDTO> {
    await this.assertCompany(ctx, companyId);
    // Нормалізуємо config схемою (відсіює зайве, гарантує форму в БД).
    const config = runPresetConfig.parse(input.config);
    try {
      const row = await this.presets.create(ctx.accountId, { companyId, name: input.name, config });
      return { ...row, config: runPresetConfig.parse(row.config) };
    } catch (e) {
      // unique(company_id, name) → 23505: людяне повідомлення замість 500.
      if (isUniqueViolation(e)) {
        throw AppError.conflict(`Пресет з іменем «${input.name}» уже існує`);
      }
      throw e;
    }
  }

  async remove(ctx: AuthCtx, id: string): Promise<void> {
    // RLS уже ізолює за account_id; deleteById повертає false, якщо рядка нема (чужий/неіснуючий).
    const ok = await this.presets.deleteById(ctx.accountId, id);
    if (!ok) throw AppError.notFound("preset");
  }

  private async assertCompany(ctx: AuthCtx, companyId: string): Promise<void> {
    const company = await this.companies.findById(ctx.accountId, companyId);
    if (!company) throw AppError.notFound("company");
  }
}

function isUniqueViolation(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { code?: string }).code === "23505";
}
