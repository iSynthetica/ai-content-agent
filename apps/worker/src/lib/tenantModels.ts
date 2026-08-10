import { and, eq } from "drizzle-orm";
import { apiKeys, decryptSecret } from "@forteq/db";
import {
  defaultModelFactory,
  type ModelConfig,
  type ModelFactoryBuilder,
  type ModelSecrets,
  type WebSearchTool,
} from "@forteq/pipeline";
import { TavilyWebSearch, withAccountScope, type HandlerContext } from "../composition.js";

// BYOK (§ADR-0016/per-company-settings): ключ провайдера резолвиться на МОМЕНТ ВИКОНАННЯ за
// (accountId, companyId) і НІКОЛИ не потрапляє у снапшот прогону чи checkpointer (секрет у стані
// графа в БД — недопустимо). Ключі тепер per-company (unique(company_id, provider)), тож companyId
// у WHERE обов'язковий — інакше в multi-company акаунті вибірка тягне рядки чужих компаній. Тут же
// enforcement «block, no fallback»: без ключа потрібного провайдера — NoTenantKeyError, а не тихий
// перехід на платформенний ключ (він генерацію орендаря не оплачує).

export class NoTenantKeyError extends Error {
  constructor(public readonly provider: string) {
    super(`Немає API-ключа орендаря для провайдера '${provider}'. Додайте ключ у налаштуваннях.`);
    this.name = "NoTenantKeyError";
  }
}

function keyFor(secrets: ModelSecrets, provider: string): string | undefined {
  if (provider === "anthropic") return secrets.anthropicApiKey;
  if (provider === "gemini") return secrets.geminiApiKey;
  return secrets.openaiApiKey;
}

// Завантажує й розшифровує ключі КОМПАНІЇ у ModelSecrets. RLS скоупить за accountId (крос-акаунт
// неможливий), companyId звужує до конкретної компанії (§per-company-settings). GCM-decrypt падає на
// побитому шифротексті (не повертає сміття).
async function loadTenantSecrets(
  ctx: HandlerContext,
  accountId: string,
  companyId: string,
): Promise<ModelSecrets> {
  if (!ctx.masterKey) {
    throw new Error("tenantModels: masterKey відсутній (BYOK_ENCRYPTION_KEY не заданий у real-режимі)");
  }
  const key = ctx.masterKey;
  const rows = await withAccountScope(ctx, accountId, (tx) =>
    tx
      .select({ provider: apiKeys.provider, ciphertext: apiKeys.ciphertext })
      .from(apiKeys)
      .where(eq(apiKeys.companyId, companyId)),
  );
  const out: ModelSecrets = {};
  for (const r of rows) {
    const plain = decryptSecret(r.ciphertext, key);
    if (r.provider === "openai") out.openaiApiKey = plain;
    else if (r.provider === "anthropic") out.anthropicApiKey = plain;
    else if (r.provider === "gemini") out.geminiApiKey = plain;
  }
  return out;
}

// Позначка «ключ використано» — окремою короткою txn. Збій НЕ має валити прогін: суто інформаційне
// поле для UI. Тому свій try/catch у виклику, а не в цьому helper'і.
async function touchLastUsed(
  ctx: HandlerContext,
  accountId: string,
  companyId: string,
  provider: string,
): Promise<void> {
  await withAccountScope(ctx, accountId, (tx) =>
    tx
      .update(apiKeys)
      .set({ lastUsedAt: new Date() })
      .where(
        and(
          eq(apiKeys.accountId, accountId),
          eq(apiKeys.companyId, companyId),
          eq(apiKeys.provider, provider),
        ),
      ),
  );
}

/**
 * ModelFactoryBuilder на ключах ОРЕНДАРЯ. У fake-режимі повертає глобальний фейковий білдер.
 * Інакше вимагає ключ КОЖНОГО з `requiredProviders` (union по ролях, §ADR-0017) — перший відсутній
 * кидає NoTenantKeyError. Для тексту — textProvidersUsed(config); для зображень — ["openai"].
 */
export async function tenantModelsBuilder(
  ctx: HandlerContext,
  accountId: string,
  companyId: string,
  requiredProviders: string[],
): Promise<ModelFactoryBuilder> {
  if (ctx.env.FAKE_MODELS === "1") return ctx.pipeline.models;

  const secrets = await loadTenantSecrets(ctx, accountId, companyId);
  const missing = requiredProviders.find((p) => !keyFor(secrets, p));
  if (missing) throw new NoTenantKeyError(missing);

  // use-mark кожного задіяного провайдера для UI; збій оновлення не критичний.
  try {
    for (const p of requiredProviders) await touchLastUsed(ctx, accountId, companyId, p);
  } catch (e) {
    ctx.logger.warn({ err: e instanceof Error ? e.message : String(e) }, "tenantModels: touch last_used_at failed");
  }

  return (mc: ModelConfig) => defaultModelFactory(mc, secrets);
}

/**
 * WebSearchTool на ключі Tavily ОРЕНДАРЯ, з ПЛАТФОРМЕННИМ фолбеком. На відміну від моделей
 * (block-no-fallback), веб-пошук опційний: ключ орендаря → платформенний env-ключ → порожній
 * (TavilyWebSearch на порожньому ключі повертає []). Тобто research деградує, а не блокується.
 * Fake-режим: віддаємо app-tier webSearch як є (жодних декриптів).
 */
export async function tenantWebSearch(
  ctx: HandlerContext,
  accountId: string,
  companyId: string,
): Promise<WebSearchTool> {
  if (ctx.env.FAKE_MODELS === "1") return ctx.pipeline.webSearch;

  let tenantKey: string | undefined;
  if (ctx.masterKey) {
    const master = ctx.masterKey;
    const rows = await withAccountScope(ctx, accountId, (tx) =>
      tx
        .select({ ciphertext: apiKeys.ciphertext })
        .from(apiKeys)
        .where(
          and(
            eq(apiKeys.accountId, accountId),
            eq(apiKeys.companyId, companyId),
            eq(apiKeys.provider, "tavily"),
          ),
        ),
    );
    if (rows[0]) tenantKey = decryptSecret(rows[0].ciphertext, master);
  }

  if (tenantKey) {
    try {
      await touchLastUsed(ctx, accountId, companyId, "tavily");
    } catch (e) {
      ctx.logger.warn(
        { err: e instanceof Error ? e.message : String(e) },
        "tenantWebSearch: touch last_used_at failed",
      );
    }
  }

  // tenantKey ?? платформенний env-ключ (може бути undefined → [] у TavilyWebSearch).
  return new TavilyWebSearch(tenantKey ?? ctx.env.TAVILY_API_KEY, ctx.logger);
}
