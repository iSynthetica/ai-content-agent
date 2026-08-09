import type { Logger } from "pino";
import {
  PUBLISH_PROVIDERS,
  type Channel,
  type PublicationDTO,
  type PublicationsResponse,
  type PublicationStatus,
  type PublishProvider,
} from "@forteq/shared";
import { AppError } from "../http/errors";
import type { AfterCommit, AuthCtx } from "../di/types";
import type {
  ContentItemsRepo,
  NewPendingPublication,
  PublicationRow,
  PublicationsRepo,
  RunsRepo,
} from "../repositories/interfaces";

function toDTO(row: PublicationRow): PublicationDTO {
  // provider/status пишемо лише ми (валідні enum) — звужуємо рядок із БД до контрактних типів.
  return {
    id: row.id,
    contentItemId: row.contentItemId,
    provider: row.provider as PublishProvider,
    status: row.status as PublicationStatus,
    externalUrl: row.externalUrl,
    error: row.error,
    publishedAt: row.publishedAt,
    createdAt: row.createdAt,
  };
}

// channel → PublishProvider: публікуємо лише у однойменний provider (linkedin/twitter/instagram).
// blog таргета не має; будь-який не-publish channel → null (відсіюється як unprocessable).
function channelToProvider(channel: Channel): PublishProvider | null {
  return (PUBLISH_PROVIDERS as readonly string[]).includes(channel)
    ? (channel as PublishProvider)
    : null;
}

// Публікація схвалених постів (§publishing §3). Тверда межа (ADR-0002): api сам НЕ публікує —
// валідує, створює pending-рядки й ставить job; зовнішній API б'є worker (content.publish).
export class PublicationsService {
  constructor(
    private readonly publications: PublicationsRepo,
    private readonly runs: RunsRepo,
    private readonly contentItems: ContentItemsRepo,
    private readonly afterCommit: AfterCommit,
    private readonly logger: Logger,
  ) {}

  async publish(ctx: AuthCtx, runId: string, itemIds: string[]): Promise<PublicationsResponse> {
    const run = await this.runs.findById(ctx.accountId, runId);
    if (!run) throw AppError.notFound("run");

    // Валідуємо КОЖЕН айтем ДО будь-якого запису: існує, належить цьому прогону, схвалений і має
    // publish-канал. Один непридатний айтем валить увесь запит (422) — щоб не опублікувати частину
    // мовчки й не лишити користувача в невизначеності, що ж поїхало.
    const targets: NewPendingPublication[] = [];
    for (const itemId of itemIds) {
      const item = await this.contentItems.findById(ctx.accountId, itemId);
      if (!item) throw AppError.notFound(`content item ${itemId}`);
      if (item.runId !== runId) {
        throw AppError.unprocessable(`item ${itemId} does not belong to run ${runId}`);
      }
      if (item.status !== "approved") {
        throw AppError.unprocessable(`item ${itemId} is not approved (status: ${item.status})`);
      }
      const provider = channelToProvider(item.channel);
      if (!provider) {
        throw AppError.unprocessable(
          `channel '${item.channel}' has no publish target (item ${itemId})`,
        );
      }
      targets.push({ contentItemId: itemId, runId, provider });
    }

    await this.publications.upsertPending(ctx.accountId, targets);

    // enqueue СТРОГО після COMMIT (§2.10.3): worker не візьме job до появи pending-рядків.
    const publishTargets = targets.map((t) => ({
      itemId: t.contentItemId,
      provider: t.provider as PublishProvider,
    }));
    this.afterCommit(async ({ ports, logger }) => {
      try {
        await ports.queue.enqueuePublish({ accountId: ctx.accountId, runId, targets: publishTargets });
        logger.info({ runId, count: publishTargets.length }, "content.publish enqueued");
      } catch (err) {
        logger.error({ runId, err }, "content.publish enqueue failed after commit");
      }
    });

    // Повертаємо поточний per-run стан (свіжостворені pending) — той самий шейп, що GET publications.
    const rows = await this.publications.listByRun(ctx.accountId, runId);
    return { items: rows.map(toDTO) };
  }

  async listPublications(ctx: AuthCtx, runId: string): Promise<PublicationsResponse> {
    const run = await this.runs.findById(ctx.accountId, runId);
    if (!run) throw AppError.notFound("run");
    const rows = await this.publications.listByRun(ctx.accountId, runId);
    return { items: rows.map(toDTO) };
  }
}
