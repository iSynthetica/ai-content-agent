// Topic preview (ad-hoc прогін): AI пропонує теми ЗАЗДАЛЕГІДЬ, людина редагує, і вже затверджений
// список іде у звичайний RunsService.createRun({ topics }) — існуючий fan-out шлях, без дублю.
//
// Тверда межа (ADR-0002): api сам НЕ кличе LLM. requestSuggestions лише валідує вхід, перевіряє
// BYOK-ключ (щоб не платити за enqueue, який worker одразу зафейлить) і ставить job.
import type { Logger } from "pino";
import { MAX_POSTS_PER_RUN, type Channel, type SuggestRunTopicsRequest } from "@forteq/shared";
import { AppError } from "../http/errors";
import type { AfterCommit, AuthCtx } from "../di/types";
import type { ApiKeysRepo, CompaniesRepo, SettingsRepo, TopicDraft, TopicDraftsRepo } from "../repositories/interfaces";

export class RunTopicDraftsService {
  constructor(
    private readonly drafts: TopicDraftsRepo,
    private readonly companies: CompaniesRepo,
    private readonly settings: SettingsRepo,
    private readonly apiKeys: ApiKeysRepo,
    private readonly afterCommit: AfterCommit,
    private readonly logger: Logger,
  ) {}

  async requestSuggestions(
    ctx: AuthCtx,
    companyId: string,
    input: SuggestRunTopicsRequest,
  ): Promise<{ draftId: string }> {
    const company = await this.companies.findById(ctx.accountId, companyId);
    if (!company) throw AppError.notFound("company");

    const settings = await this.settings.getByCompany(ctx.accountId, companyId);
    if (!settings) {
      throw AppError.unprocessable(
        "company is not configured: settings are required before suggesting topics",
      );
    }

    // Guardrail-и дзеркалять RunsService.createRun (ad-hoc-гілка): хоча б один канал, сума ≤ MAX.
    const counts: Record<string, number> = {};
    let total = 0;
    for (const channel of input.channels) {
      const n = input.counts[channel] ?? 0;
      counts[channel] = n;
      total += n;
    }
    if (total === 0) {
      throw AppError.unprocessable("Вкажіть кількість тем хоча б для одного каналу");
    }
    if (total > MAX_POSTS_PER_RUN) {
      throw AppError.unprocessable(
        `Забагато тем (${total}); максимум ${MAX_POSTS_PER_RUN} на один прогін`,
      );
    }

    // BYOK (§ADR-0016): підбір тем — теж LLM-виклик ключем ОРЕНДАРЯ (strategist-слот). Швидкий 422
    // тут, а не мовчазний фейл після enqueue — дешевше для UX (не треба чекати поллінг, щоб дізнатись).
    const provider = settings.agentModels?.strategist?.provider ?? settings.provider;
    if (!(await this.apiKeys.exists(ctx.accountId, provider))) {
      throw AppError.unprocessable(
        `Додайте API-ключ провайдера '${provider}' у налаштуваннях акаунта, щоб пропонувати теми`,
      );
    }

    const draft = await this.drafts.create(ctx.accountId, {
      companyId,
      input: { channels: input.channels as Channel[], counts, angle: input.angle },
    });

    // enqueue СТРОГО після COMMIT (§2.10.3) — інакше worker міг би взяти job до появи рядка чернетки.
    this.afterCommit(async ({ ports, logger }) => {
      try {
        await ports.queue.enqueueSuggestRunTopics({
          accountId: ctx.accountId,
          companyId,
          draftId: draft.id,
        });
        logger.info({ draftId: draft.id }, "runtopics.suggest enqueued");
      } catch (err) {
        logger.error({ draftId: draft.id, err }, "runtopics.suggest enqueue failed after commit");
      }
    });

    return { draftId: draft.id };
  }

  async getDraft(ctx: AuthCtx, companyId: string, draftId: string): Promise<TopicDraft> {
    const draft = await this.drafts.findByCompanyAndId(ctx.accountId, companyId, draftId);
    if (!draft) throw AppError.notFound("topic draft");
    return draft;
  }
}
