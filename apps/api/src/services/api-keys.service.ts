import { encryptSecret } from "@forteq/db";
import { AppError } from "../http/errors";
import type { AuthCtx } from "../di/types";
import type { ApiKeyMasked, ApiKeysRepo, CompaniesRepo } from "../repositories/interfaces";

// BYOK — керування ключами провайдерів орендаря НА РІВНІ КОМПАНІЇ (§per-company-settings). Шифрування
// на запис живе ТУТ (master-ключ приходить у конструктор із composition, §ADR-0016); repo бачить лише
// готовий шифротекст. Самого ключа сервіс НЕ повертає нікому — назовні йде тільки маскована форма
// (last4). companyId приходить із path — сервіс звіряє приналежність компанії акаунту перед дією.
export class ApiKeysService {
  constructor(
    private readonly apiKeys: ApiKeysRepo,
    private readonly companies: CompaniesRepo,
    private readonly masterKey: Buffer,
  ) {}

  async list(ctx: AuthCtx, companyId: string): Promise<ApiKeyMasked[]> {
    await this.assertCompany(ctx, companyId);
    return this.apiKeys.list(ctx.accountId, companyId);
  }

  async set(
    ctx: AuthCtx,
    companyId: string,
    provider: string,
    key: string,
    label?: string,
  ): Promise<void> {
    await this.assertCompany(ctx, companyId);
    const enc = encryptSecret(key.trim(), this.masterKey);
    await this.apiKeys.upsert(ctx.accountId, companyId, {
      provider,
      ciphertext: enc.ciphertext,
      last4: enc.last4,
      label: label ?? null,
    });
  }

  async remove(ctx: AuthCtx, companyId: string, provider: string): Promise<void> {
    await this.assertCompany(ctx, companyId);
    const deleted = await this.apiKeys.delete(ctx.accountId, companyId, provider);
    if (!deleted) throw AppError.notFound("api key");
  }

  private async assertCompany(ctx: AuthCtx, companyId: string): Promise<void> {
    const company = await this.companies.findById(ctx.accountId, companyId);
    if (!company) throw AppError.notFound("company");
  }
}
