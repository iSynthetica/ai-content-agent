import { and, eq } from "drizzle-orm";
import { serviceConnections } from "@forteq/db";
import type { DbExecutor } from "../di/types";
import type {
  NewServiceConnection,
  ServiceConnectionAppCreds,
  ServiceConnectionMasked,
  ServiceConnectionsRepo,
} from "./interfaces";

type Row = typeof serviceConnections.$inferSelect;

// scopes зберігаються рядком (пробіл/кома-joined — залежить від провайдера). Розбиваємо на масив
// для маскованого DTO; на межі web бачить string[].
function parseScopes(raw: string | null): string[] {
  if (!raw) return [];
  return raw.split(/[\s,]+/).filter(Boolean);
}

// Маскована проєкція — *_ct (токени + app_client_secret_ct) НІКОЛИ не виходять із репо (дзеркалить
// api_keys.toMasked). appClientId — НЕ секрет, тож віддаємо; appConfigured — чи введено ОБИДВІ креди.
function toMasked(row: Row): ServiceConnectionMasked {
  return {
    provider: row.provider,
    status: row.status,
    externalAccountId: row.externalAccountId,
    externalAccountName: row.externalAccountName,
    scopes: parseScopes(row.scopes),
    expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
    lastUsedAt: row.lastUsedAt ? row.lastUsedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    appConfigured: Boolean(row.appClientId && row.appClientSecretCt),
    appClientId: row.appClientId,
  };
}

// service_connections — 1 запис на (company, provider) під RLS-скоупом за account_id + company_id
// як WHERE-фільтр (§per-company-settings). Upsert по UNIQUE(company_id, provider): повторне
// підключення ротує токени компанії на місці, а не плодить рядки.
export class DrizzleServiceConnectionsRepo implements ServiceConnectionsRepo {
  constructor(private readonly tx: DbExecutor) {}

  async list(accountId: string, companyId: string): Promise<ServiceConnectionMasked[]> {
    const rows = await this.tx
      .select()
      .from(serviceConnections)
      .where(
        and(
          eq(serviceConnections.accountId, accountId),
          eq(serviceConnections.companyId, companyId),
        ),
      );
    return rows.map(toMasked);
  }

  async upsert(accountId: string, companyId: string, data: NewServiceConnection): Promise<void> {
    await this.tx
      .insert(serviceConnections)
      .values({
        accountId,
        companyId,
        provider: data.provider,
        status: data.status ?? "connected",
        accessTokenCt: data.accessTokenCt,
        refreshTokenCt: data.refreshTokenCt ?? null,
        externalAccountId: data.externalAccountId ?? null,
        externalAccountName: data.externalAccountName ?? null,
        scopes: data.scopes ?? null,
        expiresAt: data.expiresAt ?? null,
        meta: data.meta ?? {},
      })
      .onConflictDoUpdate({
        target: [serviceConnections.companyId, serviceConnections.provider],
        set: {
          status: data.status ?? "connected",
          accessTokenCt: data.accessTokenCt,
          refreshTokenCt: data.refreshTokenCt ?? null,
          externalAccountId: data.externalAccountId ?? null,
          externalAccountName: data.externalAccountName ?? null,
          scopes: data.scopes ?? null,
          expiresAt: data.expiresAt ?? null,
          meta: data.meta ?? {},
          updatedAt: new Date(),
        },
      });
  }

  async delete(accountId: string, companyId: string, provider: string): Promise<boolean> {
    const deleted = await this.tx
      .delete(serviceConnections)
      .where(
        and(
          eq(serviceConnections.accountId, accountId),
          eq(serviceConnections.companyId, companyId),
          eq(serviceConnections.provider, provider),
        ),
      )
      .returning({ id: serviceConnections.id });
    return deleted.length > 0;
  }

  async existsByProvider(accountId: string, companyId: string, provider: string): Promise<boolean> {
    const [row] = await this.tx
      .select({ id: serviceConnections.id })
      .from(serviceConnections)
      .where(
        and(
          eq(serviceConnections.accountId, accountId),
          eq(serviceConnections.companyId, companyId),
          eq(serviceConnections.provider, provider),
        ),
      )
      .limit(1);
    return Boolean(row);
  }

  async getAppCredentials(
    accountId: string,
    companyId: string,
    provider: string,
  ): Promise<ServiceConnectionAppCreds | null> {
    const [row] = await this.tx
      .select({
        appClientId: serviceConnections.appClientId,
        appClientSecretCt: serviceConnections.appClientSecretCt,
      })
      .from(serviceConnections)
      .where(
        and(
          eq(serviceConnections.accountId, accountId),
          eq(serviceConnections.companyId, companyId),
          eq(serviceConnections.provider, provider),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  // Записує ЛИШЕ креди застосунку. onConflictDoUpdate.set навмисно НЕ чіпає токени/статус/акаунт —
  // повторний ввід кред не роз'єднує наявний конект. На INSERT (рядка ще нема) — status 'disconnected'
  // без токенів: конект «сконфігуровано, але не підключено», доки користувач не пройде OAuth.
  async setAppCredentials(
    accountId: string,
    companyId: string,
    provider: string,
    clientId: string,
    clientSecretCt: string,
  ): Promise<void> {
    await this.tx
      .insert(serviceConnections)
      .values({
        accountId,
        companyId,
        provider,
        status: "disconnected",
        accessTokenCt: null,
        appClientId: clientId,
        appClientSecretCt: clientSecretCt,
      })
      .onConflictDoUpdate({
        target: [serviceConnections.companyId, serviceConnections.provider],
        set: {
          appClientId: clientId,
          appClientSecretCt: clientSecretCt,
          updatedAt: new Date(),
        },
      });
  }
}
