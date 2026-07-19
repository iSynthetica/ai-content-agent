import type { Job } from "@forteq/shared";
import type { HandlerContext } from "../composition.js";

type SuggestTopicsJob = Extract<Job, { kind: "planner.suggest_topics" }>;

/**
 * Хендлер job `planner.suggest_topics` — генерація/дозаповнення тем для слотів content_plan.
 * Наявний `planEntryIds` → скоуп на конкретні слоти; інакше — увесь план.
 * СКЕЛЕТ (інший барʼєр): логуємо + TODO-тіло; хендлер відкриватиме ВЛАСНИЙ withAccountScope(ctx, ...).
 */
export async function handleSuggestTopics(
  job: SuggestTopicsJob,
  ctx: HandlerContext,
): Promise<void> {
  ctx.logger.info(
    {
      contentPlanId: job.contentPlanId,
      companyId: job.companyId,
      entries: job.planEntryIds?.length ?? 0,
    },
    "planner.suggest_topics",
  );

  // TODO у межах ВЛАСНОЇ scoped-txn (withAccountScope(ctx, job.accountId, ...)):
  //   1. зчитати content_plan + цільові plan_entries (за planEntryIds або весь горизонт)
  //   2. згенерувати/дозаповнити теми (ймовірно окрема planner-функція або Strategist-логіка
  //      з @forteq/pipeline, §7.2 скоупнутий режим)
  //   3. upsert у plan_entries (topic/keyMessage/seoKeywords/pillar), status: proposed
}
