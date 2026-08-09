import { and, eq, inArray } from "drizzle-orm";
import type { Job, PublishProvider } from "@forteq/shared";
import { MEDIA_PATH_PREFIX, publishFailedInbox, publishSucceededEvent } from "@forteq/shared";
import { signMediaToken } from "@forteq/shared/media-token";
import { contentItems, publications, serviceConnections, decryptSecret, encryptSecret } from "@forteq/db";
import { withAccountScope, type HandlerContext } from "../composition.js";
import { openInbox, writeNotification } from "../lib/notify.js";
import { getPublisher } from "../lib/publishers/registry.js";
import type { PublishInput, PublishResult } from "../lib/publishers/types.js";
import { isExpired, refreshIfNeeded, type DecryptedConnection } from "../lib/publishTokens.js";

type PublishContentJob = Extract<Job, { kind: "content.publish" }>;

type Target = PublishContentJob["targets"][number];

// Знімок content_items-рядка, потрібний для посту (+ companyId для inbox-задачі).
interface ItemRow {
  id: string;
  companyId: string;
  channel: PublishInput["item"]["channel"];
  title: string | null;
  text: string | null;
  imageUrl: string | null;
}

// Результат обробки одного таргета для персисту в короткій txn.
type Outcome =
  | { kind: "published"; result: PublishResult }
  | { kind: "failed"; error: string };

/**
 * Хендлер job `content.publish` (§publishing foundation §4.2) — публікує СХВАЛЕНІ пости у соцмережі
 * ПІСЛЯ рішення людини. Модельований на contentVisuals.ts: ідемпотентний pending-set, ізоляція
 * помилок по таргету, секрети розшифровуються на момент виконання (BYOK, §ADR-0016).
 *
 * Тверда межа транзакцій (§13, boundary #4): зовнішній HTTP публікації — ПОЗА txn; у БД ходимо лише
 * короткими scoped-txn під RLS. Одна впала публікація НЕ валить job (як errors[] у пайплайні).
 */
export async function handlePublishContent(
  job: PublishContentJob,
  ctx: HandlerContext,
): Promise<void> {
  const { accountId, runId, targets } = job;
  ctx.logger.info({ runId, targets: targets.length }, "content.publish");

  // ── 1) КОРОТКА scoped-txn: завантажити цільові items + наявні публікації. Обчислити pending. ──
  // Ідемпотентність: не публікуємо те, що вже 'published' (захист від retry job'и / повторного enqueue).
  const { items, pending } = await withAccountScope(ctx, accountId, async (tx) => {
    const itemIds = targets.map((t) => t.itemId);
    const rows = await tx
      .select({
        id: contentItems.id,
        companyId: contentItems.companyId,
        channel: contentItems.channel,
        title: contentItems.title,
        text: contentItems.text,
        imageUrl: contentItems.imageUrl,
      })
      .from(contentItems)
      .where(and(eq(contentItems.runId, runId), inArray(contentItems.id, itemIds)));
    const itemMap = new Map<string, ItemRow>(rows.map((r) => [r.id, r as ItemRow]));

    const pubs = await tx
      .select({
        contentItemId: publications.contentItemId,
        provider: publications.provider,
        status: publications.status,
      })
      .from(publications)
      .where(eq(publications.runId, runId));
    const publishedKeys = new Set(
      pubs.filter((p) => p.status === "published").map((p) => `${p.contentItemId}::${p.provider}`),
    );

    // pending = таргети, чий item існує І ще не опублікований у цей provider.
    const pend = targets.filter((t) => {
      if (!itemMap.has(t.itemId)) return false; // item зник — публікувати нічого
      return !publishedKeys.has(`${t.itemId}::${t.provider}`);
    });
    return { items: itemMap, pending: pend };
  });

  if (pending.length === 0) {
    ctx.logger.info({ runId }, "content.publish: нічого публікувати (усе вже опубліковано)");
    return;
  }

  // ── 2) Кожен таргет ПОЗА txn: connection → refresh → image → publish HTTP. Ізольовано. ──
  let published = 0;
  let failed = 0;
  for (const target of pending) {
    const item = items.get(target.itemId)!;
    try {
      const outcome = await publishOne(ctx, accountId, target, item);
      // ── 3) КОРОТКА scoped-txn: upsert publications + last_used_at + доменна подія. ──
      await persistOutcome(ctx, accountId, runId, target, item, outcome);
      if (outcome.kind === "published") published += 1;
      else failed += 1;
    } catch (e) {
      // Ізоляція: несподівана помилка одного таргета НЕ валить job. Пробуємо зафіксувати failed.
      failed += 1;
      const error = e instanceof Error ? e.message : String(e);
      ctx.logger.error({ runId, itemId: target.itemId, provider: target.provider, error }, "content.publish item failed");
      try {
        await persistOutcome(ctx, accountId, runId, target, item, { kind: "failed", error });
      } catch (e2) {
        ctx.logger.error(
          { runId, itemId: target.itemId, err: e2 instanceof Error ? e2.message : String(e2) },
          "content.publish: не вдалося зафіксувати failed-публікацію",
        );
      }
    }
  }

  ctx.logger.info({ runId, published, failed }, "content.publish done");
}

/**
 * Обробка ОДНОГО таргета поза будь-якою txn (окрім короткого читання connection). Повертає Outcome
 * для персисту. Кидає лише на несподіваних помилках — очікувані (не підключено / reconnect / не
 * реалізовано / збій адаптера) повертаються як { kind: "failed" }.
 */
async function publishOne(
  ctx: HandlerContext,
  accountId: string,
  target: Target,
  item: ItemRow,
): Promise<Outcome> {
  const provider = target.provider;

  // 2a) КОРОТКА txn: прочитати рядок service_connections для provider.
  const connRow = await withAccountScope(ctx, accountId, async (tx) => {
    const rows = await tx
      .select({
        accessTokenCt: serviceConnections.accessTokenCt,
        refreshTokenCt: serviceConnections.refreshTokenCt,
        externalAccountId: serviceConnections.externalAccountId,
        expiresAt: serviceConnections.expiresAt,
        meta: serviceConnections.meta,
        status: serviceConnections.status,
      })
      .from(serviceConnections)
      .where(and(eq(serviceConnections.accountId, accountId), eq(serviceConnections.provider, provider)))
      .limit(1);
    return rows[0];
  });

  if (!connRow || !connRow.accessTokenCt) {
    return { kind: "failed", error: "not connected" };
  }
  if (!ctx.masterKey) {
    // Реальний конект є, але нема master-ключа для розшифрування (fake-режим) — публікувати не можна.
    return { kind: "failed", error: "encryption key unavailable" };
  }

  // 2b) Розшифрувати токени в пам'яті (у payload/checkpointer вони НЕ потрапляють, §ADR-0016).
  const conn: DecryptedConnection = {
    accessToken: decryptSecret(connRow.accessTokenCt, ctx.masterKey),
    refreshToken: connRow.refreshTokenCt ? decryptSecret(connRow.refreshTokenCt, ctx.masterKey) : undefined,
    expiresAt: connRow.expiresAt,
    externalAccountId: connRow.externalAccountId ?? undefined,
    meta: connRow.meta ?? undefined,
  };

  // 2c) Рефреш, якщо протух. null → рефреш неможливий (нема refresh_token/кред) → reconnect required.
  const wasExpired = isExpired(conn.expiresAt);
  const refreshed = await refreshIfNeeded(provider, conn, ctx.env, ctx.logger);
  if (!refreshed) {
    return { kind: "failed", error: "reconnect required" };
  }
  // Якщо реально рефрешнули — перезберігаємо новий токен (best-effort; не критично для цієї спроби).
  if (wasExpired) {
    await persistRefreshedToken(ctx, accountId, provider, refreshed).catch(() => {});
  }

  // 2d) Байти зображення, якщо item.imageUrl заданий. Читання може впасти (файлу нема) — тоді
  // публікуємо без зображення (де воно опційне; IG-адаптер сам валідує обов'язковість).
  let imageBytes: Buffer | undefined;
  if (item.imageUrl) {
    const key = keyFromMediaUrl(item.imageUrl);
    if (key) {
      try {
        imageBytes = await ctx.imageStorage.read(key);
      } catch (e) {
        ctx.logger.warn(
          { itemId: item.id, key, err: e instanceof Error ? e.message : String(e) },
          "content.publish: не вдалося прочитати зображення — публікуємо без нього",
        );
      }
    }
  }

  // 2d-bis) Публічний URL зображення — ЛИШЕ для Instagram (Graph API тягне URL сам, сервером Meta,
  // без cookie-сесії; байти йому не передати). Карбуємо коротко-живучий (15хв) HMAC-токен; публічний
  // роут /media/public/:token віддасть JPEG (транскод із PNG). Для LinkedIn/X — не потрібно (байти).
  let publicImageUrl: string | undefined;
  if (provider === "instagram" && item.imageUrl && ctx.env.MEDIA_SIGNING_SECRET) {
    const key = keyFromMediaUrl(item.imageUrl);
    if (key) {
      const token = signMediaToken(key, ctx.env.MEDIA_SIGNING_SECRET, 15 * 60);
      publicImageUrl = `${ctx.env.PUBLIC_MEDIA_BASE_URL}/media/public/${token}`;
    }
  }

  // 2e) Реєстр публікаторів. Порожній у foundation-фазі → provider not implemented yet.
  const publisher = getPublisher(ctx.publishers, provider);
  if (!publisher) {
    return { kind: "failed", error: "provider not implemented yet" };
  }

  // 2f) Власне публікація (зовнішній HTTP, ПОЗА txn).
  const input: PublishInput = {
    item: {
      id: item.id,
      channel: item.channel,
      title: item.title,
      text: item.text,
      imageUrl: item.imageUrl,
    },
    imageBytes,
    publicImageUrl,
    connection: {
      accessToken: refreshed.accessToken,
      refreshToken: refreshed.refreshToken,
      externalAccountId: conn.externalAccountId,
      meta: conn.meta,
    },
  };
  const result = await publisher.publish(input);
  return { kind: "published", result };
}

/** КОРОТКА scoped-txn: upsert рядка publications + last_used_at connection + доменна подія. */
async function persistOutcome(
  ctx: HandlerContext,
  accountId: string,
  runId: string,
  target: Target,
  item: ItemRow,
  outcome: Outcome,
): Promise<void> {
  await withAccountScope(ctx, accountId, async (tx) => {
    const now = new Date();
    if (outcome.kind === "published") {
      await tx
        .insert(publications)
        .values({
          accountId,
          contentItemId: target.itemId,
          runId,
          provider: target.provider,
          status: "published",
          externalPostId: outcome.result.externalPostId,
          externalUrl: outcome.result.externalUrl,
          error: null,
          publishedAt: now,
        })
        .onConflictDoUpdate({
          target: [publications.contentItemId, publications.provider],
          set: {
            status: "published",
            externalPostId: outcome.result.externalPostId,
            externalUrl: outcome.result.externalUrl,
            error: null,
            publishedAt: now,
            updatedAt: now,
          },
        });
      // last_used_at — інформаційне поле для UI; лише при успіху.
      await tx
        .update(serviceConnections)
        .set({ lastUsedAt: now })
        .where(
          and(eq(serviceConnections.accountId, accountId), eq(serviceConnections.provider, target.provider)),
        );
      // Успіх — інформаційна нотифікація з посиланням на пост.
      await writeNotification(
        tx,
        accountId,
        publishSucceededEvent({
          runId,
          contentItemId: target.itemId,
          provider: target.provider,
          externalUrl: outcome.result.externalUrl,
        }),
      );
    } else {
      await tx
        .insert(publications)
        .values({
          accountId,
          contentItemId: target.itemId,
          runId,
          provider: target.provider,
          status: "failed",
          error: outcome.error,
        })
        .onConflictDoUpdate({
          target: [publications.contentItemId, publications.provider],
          set: { status: "failed", error: outcome.error, updatedAt: now },
        });
      // Невдача — actionable: перепідключити акаунт / повторити. openInbox ідемпотентний.
      await openInbox(
        tx,
        accountId,
        publishFailedInbox({
          runId,
          companyId: item.companyId,
          contentItemId: target.itemId,
          provider: target.provider,
          error: outcome.error,
        }),
      );
    }
  });
}

/** Перезберігає рефрешнутий токен (шифрує заново). Best-effort — виклик обгорнутий у .catch(). */
async function persistRefreshedToken(
  ctx: HandlerContext,
  accountId: string,
  provider: PublishProvider,
  refreshed: { accessToken: string; refreshToken?: string; expiresAt?: Date | null },
): Promise<void> {
  if (!ctx.masterKey) return;
  const key = ctx.masterKey;
  const accessCt = encryptSecret(refreshed.accessToken, key).ciphertext;
  const refreshCt = refreshed.refreshToken ? encryptSecret(refreshed.refreshToken, key).ciphertext : undefined;
  await withAccountScope(ctx, accountId, async (tx) => {
    await tx
      .update(serviceConnections)
      .set({
        accessTokenCt: accessCt,
        ...(refreshCt ? { refreshTokenCt: refreshCt } : {}),
        expiresAt: refreshed.expiresAt ?? null,
        status: "connected",
        updatedAt: new Date(),
      })
      .where(and(eq(serviceConnections.accountId, accountId), eq(serviceConnections.provider, provider)));
  });
}

// Відновлює storage-ключ із публічного media-URL: /api/media/<runId>/<draftId>.<ext> → <runId>/<draftId>.<ext>.
// Конвенція шляху — з @forteq/shared (MEDIA_PATH_PREFIX), щоб worker (пише) і цей ридер не розійшлися.
function keyFromMediaUrl(imageUrl: string): string | null {
  const prefix = `${MEDIA_PATH_PREFIX}/`;
  return imageUrl.startsWith(prefix) ? imageUrl.slice(prefix.length) : null;
}
