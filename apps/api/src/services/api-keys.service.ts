import { encryptSecret } from "@forteq/db";
import { AppError } from "../http/errors";
import type { AuthCtx } from "../di/types";
import type { ApiKeyMasked, ApiKeysRepo } from "../repositories/interfaces";

// BYOK — керування ключами провайдерів орендаря. Шифрування на запис живе ТУТ (master-ключ
// приходить у конструктор із composition, §ADR-0016); repo бачить лише готовий шифротекст.
// Самого ключа сервіс НЕ повертає нікому — назовні йде тільки маскована форма (last4).
export class ApiKeysService {
  constructor(
    private readonly apiKeys: ApiKeysRepo,
    private readonly masterKey: Buffer,
  ) {}

  async list(ctx: AuthCtx): Promise<ApiKeyMasked[]> {
    return this.apiKeys.list(ctx.accountId);
  }

  async set(ctx: AuthCtx, provider: string, key: string, label?: string): Promise<void> {
    const enc = encryptSecret(key.trim(), this.masterKey);
    await this.apiKeys.upsert(ctx.accountId, {
      provider,
      ciphertext: enc.ciphertext,
      last4: enc.last4,
      label: label ?? null,
    });
  }

  async remove(ctx: AuthCtx, provider: string): Promise<void> {
    const deleted = await this.apiKeys.delete(ctx.accountId, provider);
    if (!deleted) throw AppError.notFound("api key");
  }
}
