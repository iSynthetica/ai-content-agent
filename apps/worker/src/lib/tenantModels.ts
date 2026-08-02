import { and, eq } from "drizzle-orm";
import { apiKeys, decryptSecret } from "@forteq/db";
import {
  defaultModelFactory,
  type ModelConfig,
  type ModelFactoryBuilder,
  type ModelSecrets,
} from "@forteq/pipeline";
import { withAccountScope, type HandlerContext } from "../composition.js";

// BYOK (§ADR-0016): ключ провайдера орендаря резолвиться на МОМЕНТ ВИКОНАННЯ за accountId і НІКОЛИ
// не потрапляє у снапшот прогону чи checkpointer (секрет у стані графа в БД — недопустимо). Тут же
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

// Завантажує й розшифровує ВСІ ключі акаунта у ModelSecrets. RLS скоупить вибірку за accountId,
// тож крос-акаунт неможливий навіть тут. GCM-decrypt падає на побитому шифротексті (не повертає сміття).
async function loadTenantSecrets(ctx: HandlerContext, accountId: string): Promise<ModelSecrets> {
  if (!ctx.masterKey) {
    throw new Error("tenantModels: masterKey відсутній (BYOK_ENCRYPTION_KEY не заданий у real-режимі)");
  }
  const key = ctx.masterKey;
  const rows = await withAccountScope(ctx, accountId, (tx) =>
    tx.select({ provider: apiKeys.provider, ciphertext: apiKeys.ciphertext }).from(apiKeys),
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
async function touchLastUsed(ctx: HandlerContext, accountId: string, provider: string): Promise<void> {
  await withAccountScope(ctx, accountId, (tx) =>
    tx
      .update(apiKeys)
      .set({ lastUsedAt: new Date() })
      .where(and(eq(apiKeys.accountId, accountId), eq(apiKeys.provider, provider))),
  );
}

/**
 * ModelFactoryBuilder на ключах ОРЕНДАРЯ. У fake-режимі повертає глобальний фейковий білдер
 * (ключі не потрібні). Інакше вимагає ключ `requiredProvider`, інакше кидає NoTenantKeyError.
 * `requiredProvider`: для тексту — modelConfig.provider; для зображень — завжди "openai".
 */
export async function tenantModelsBuilder(
  ctx: HandlerContext,
  accountId: string,
  requiredProvider: string,
): Promise<ModelFactoryBuilder> {
  if (ctx.env.FAKE_MODELS === "1") return ctx.pipeline.models;

  const secrets = await loadTenantSecrets(ctx, accountId);
  if (!keyFor(secrets, requiredProvider)) throw new NoTenantKeyError(requiredProvider);

  // use-mark для UI; збій оновлення не критичний.
  try {
    await touchLastUsed(ctx, accountId, requiredProvider);
  } catch (e) {
    ctx.logger.warn({ err: e instanceof Error ? e.message : String(e) }, "tenantModels: touch last_used_at failed");
  }

  return (mc: ModelConfig) => defaultModelFactory(mc, secrets);
}
