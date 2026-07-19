import type { Job } from "@forteq/shared";
import type { HandlerContext } from "../composition.js";

type OnboardingBootstrapJob = Extract<Job, { kind: "onboarding.bootstrap" }>;

/**
 * Хендлер job `onboarding.bootstrap` — enrichment бренд-профілю ПОЗА графом (spike-1 §6.1).
 * Job несе лише companyId; решту (name/websiteUrl/description/modelConfig) хендлер підтягує з БД.
 * СКЕЛЕТ (інший барʼєр): логуємо + TODO-тіло; хендлер відкриватиме ВЛАСНИЙ withAccountScope(ctx, ...).
 */
export async function handleBootstrapOnboarding(
  job: OnboardingBootstrapJob,
  ctx: HandlerContext,
): Promise<void> {
  ctx.logger.info({ companyId: job.companyId }, "onboarding.bootstrap");

  // TODO(spike-1 §6.1) у межах ВЛАСНОЇ scoped-txn (withAccountScope(ctx, job.accountId, ...)):
  //   1. зчитати company (name/websiteUrl/description) + резолвлений modelConfig з БД
  //   2. зібрати BootstrapInput { name, websiteUrl?, description?, modelConfig, meta }
  //   3. const { draft, costCents } = await draftBrandProfile(ctx.pipeline, input)  // з @forteq/pipeline
  //      — легка функція (web fetch + 1 LLM-виклик), НЕ нода графа, без checkpointer'а
  //   4. записати чернетку бренд-профілю (через repos), NotificationService.notify("onboarding_ready")
}
