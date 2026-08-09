import type { Job } from "@forteq/shared";
import type { HandlerContext } from "./composition.js";
import { handleStart } from "./handlers/start.js";
import { handleResume } from "./handlers/resume.js";
import { handleBootstrapOnboarding } from "./handlers/bootstrapOnboarding.js";
import { handleSuggestTopics } from "./handlers/suggestTopics.js";
import { handleSuggestRunTopics } from "./handlers/suggestRunTopics.js";
import { handleContentVisuals } from "./handlers/contentVisuals.js";
import { handlePublishContent } from "./handlers/publishContent.js";

/**
 * Роутинг за дискримінантом `job.kind` (discriminated union з @forteq/shared jobs.ts) →
 * відповідний хендлер. Усі типи job покриті; вичерпність гарантує компілятор (гілка never).
 */
export async function route(job: Job, ctx: HandlerContext): Promise<void> {
  switch (job.kind) {
    case "generation.start":
      return handleStart(job, ctx);
    case "generation.resume":
      return handleResume(job, ctx);
    case "onboarding.bootstrap":
      return handleBootstrapOnboarding(job, ctx);
    case "planner.suggest_topics":
      return handleSuggestTopics(job, ctx);
    case "runtopics.suggest":
      return handleSuggestRunTopics(job, ctx);
    case "content.visuals":
      return handleContentVisuals(job, ctx);
    case "content.publish":
      return handlePublishContent(job, ctx);
    default: {
      // Вичерпність union: якщо у jobs.ts додасться новий kind — компілятор впаде саме тут.
      const _exhaustive: never = job;
      throw new Error(`Невідомий тип job: ${JSON.stringify(_exhaustive)}`);
    }
  }
}
