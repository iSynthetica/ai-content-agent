import { and, eq } from "drizzle-orm";
import { apiKeys } from "@forteq/db";
import type { DbExecutor } from "../di/types";
import type { ApiKeyMasked, ApiKeysRepo, NewApiKey } from "./interfaces";

type ApiKeyRow = typeof apiKeys.$inferSelect;

// Маскована проєкція — шифротекст НІКОЛИ не виходить із репо в бік api/сервісу. api лише пише і
// показує last4; розшифровує ключ виключно воркер на момент виконання (ADR-0016).
function toMasked(row: ApiKeyRow): ApiKeyMasked {
  return {
    provider: row.provider,
    last4: row.last4,
    label: row.label,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    lastUsedAt: row.lastUsedAt ? row.lastUsedAt.toISOString() : null,
  };
}

// api_keys — 1 ключ на (company, provider), RLS-скоуп за account_id (ADR-0003) + company_id як
// WHERE-фільтр (§per-company-settings). Upsert по унікальному (company_id, provider): повторний
// запис ротує ключ компанії на місці, а не плодить рядки.
export class DrizzleApiKeysRepo implements ApiKeysRepo {
  constructor(private readonly tx: DbExecutor) {}

  async list(accountId: string, companyId: string): Promise<ApiKeyMasked[]> {
    const rows = await this.tx
      .select()
      .from(apiKeys)
      .where(and(eq(apiKeys.accountId, accountId), eq(apiKeys.companyId, companyId)));
    return rows.map(toMasked);
  }

  async upsert(accountId: string, companyId: string, data: NewApiKey): Promise<void> {
    await this.tx
      .insert(apiKeys)
      .values({
        accountId,
        companyId,
        provider: data.provider,
        ciphertext: data.ciphertext,
        last4: data.last4,
        label: data.label ?? null,
      })
      .onConflictDoUpdate({
        target: [apiKeys.companyId, apiKeys.provider],
        set: {
          ciphertext: data.ciphertext,
          last4: data.last4,
          label: data.label ?? null,
          updatedAt: new Date(),
        },
      });
  }

  async delete(accountId: string, companyId: string, provider: string): Promise<boolean> {
    const deleted = await this.tx
      .delete(apiKeys)
      .where(
        and(
          eq(apiKeys.accountId, accountId),
          eq(apiKeys.companyId, companyId),
          eq(apiKeys.provider, provider),
        ),
      )
      .returning({ id: apiKeys.id });
    return deleted.length > 0;
  }

  async exists(accountId: string, companyId: string, provider: string): Promise<boolean> {
    const [row] = await this.tx
      .select({ id: apiKeys.id })
      .from(apiKeys)
      .where(
        and(
          eq(apiKeys.accountId, accountId),
          eq(apiKeys.companyId, companyId),
          eq(apiKeys.provider, provider),
        ),
      )
      .limit(1);
    return Boolean(row);
  }
}
