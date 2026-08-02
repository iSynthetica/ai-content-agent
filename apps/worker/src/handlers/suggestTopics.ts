import { and, eq, inArray, isNull, or } from "drizzle-orm";
import type { Job } from "@forteq/shared";
import { companies, companySettings, contentPlans, planEntries } from "@forteq/db";
import {
  suggestTopics,
  resolveModelConfig,
  DEFAULT_MODELS,
  type CompanyContext,
  type ModelConfig,
  type TopicSlot,
} from "@forteq/pipeline";
import { withAccountScope, type HandlerContext } from "../composition.js";
import { NoTenantKeyError, tenantModelsBuilder } from "../lib/tenantModels.js";

type SuggestTopicsJob = Extract<Job, { kind: "planner.suggest_topics" }>;

/**
 * Хендлер job `planner.suggest_topics` (§5 раунд 2) — наповнює порожні слоти плану темами.
 * Наявний `planEntryIds` → скоуп на конкретні слоти; інакше — усі слоти плану без теми.
 *
 * Планування відокремлене від генерації: тут лише пропонуються теми, які людина перегляне і
 * погодить. Жодного контенту не генерується — це коштувало б грошей за текст, який ще може
 * бути відкинутий разом із темою.
 *
 * Межа транзакцій (ADR-0010): короткий scoped-read → LLM ПОЗА txn → короткий scoped-write.
 */
export async function handleSuggestTopics(
  job: SuggestTopicsJob,
  ctx: HandlerContext,
): Promise<void> {
  const { accountId, companyId, contentPlanId } = job;
  const targetIds = job.planEntryIds ?? [];
  ctx.logger.info({ contentPlanId, companyId, targets: targetIds.length }, "planner.suggest_topics");

  // ── 1) КОРОТКА txn: контекст компанії, пілари, порожні слоти, вже наявні теми ──
  const input = await withAccountScope(ctx, accountId, async (tx) => {
    const [company] = await tx.select().from(companies).where(eq(companies.id, companyId));
    if (!company) throw new Error(`planner.suggest_topics: company ${companyId} не знайдено`);

    const [settings] = await tx
      .select()
      .from(companySettings)
      .where(eq(companySettings.companyId, companyId));
    const [plan] = await tx.select().from(contentPlans).where(eq(contentPlans.id, contentPlanId));

    const scope = and(
      eq(planEntries.accountId, accountId),
      eq(planEntries.companyId, companyId),
      eq(planEntries.contentPlanId, contentPlanId),
    );

    // Цільові слоти: явно передані АБО всі без теми. Слот із темою не чіпаємо — інакше повторний
    // запуск затирав би те, що людина вже відредагувала вручну.
    const rows = await tx
      .select()
      .from(planEntries)
      .where(
        targetIds.length > 0
          ? and(scope, inArray(planEntries.id, targetIds), isNull(planEntries.topic))
          : and(scope, or(isNull(planEntries.topic), eq(planEntries.topic, ""))),
      );

    // Уже наявні теми плану — вхід для дедупу, щоб місяць не склався з варіацій однієї думки.
    const withTopics = await tx.select({ topic: planEntries.topic }).from(planEntries).where(scope);

    const companyContext: CompanyContext = {
      name: company.name,
      positioning: company.positioning ?? undefined,
      stack: company.stack ?? [],
      services: company.services ?? [],
      audience: company.audience ?? undefined,
      toneOfVoice: settings?.toneOfVoice ?? undefined,
      toneExamples: settings?.toneExamples ?? [],
      visualStyle: settings?.visualStyle ?? undefined,
      forbiddenPhrases: settings?.forbiddenPhrases ?? [],
      language: settings?.language ?? "uk",
    };

    const config = (plan?.config ?? {}) as { pillars?: string[] };
    const snapshot: Partial<ModelConfig> | undefined = settings
      ? {
          provider: settings.provider as ModelConfig["provider"],
          models: settings.models ?? undefined,
        }
      : undefined;

    return {
      company: companyContext,
      pillars: config.pillars ?? [],
      slots: rows.map((r): TopicSlot => ({ id: r.id, channel: r.channel, date: r.date })),
      existingTopics: withTopics.map((r) => r.topic).filter((t): t is string => Boolean(t)),
      modelConfig: resolveModelConfig(snapshot, DEFAULT_MODELS),
    };
  });

  if (input.slots.length === 0) {
    ctx.logger.info({ contentPlanId }, "planner.suggest_topics: порожніх слотів немає");
    return;
  }

  // ── 2) ПОЗА txn: LLM ──
  // BYOK (§ADR-0016): теми пропонує ключ ОРЕНДАРЯ. Немає ключа — не фейлимо (планер вторинний):
  // лог і вихід, слоти лишаються порожні, людина побачить причину в статусі ключа.
  let builder;
  try {
    builder = await tenantModelsBuilder(ctx, accountId, input.modelConfig.provider);
  } catch (e) {
    if (!(e instanceof NoTenantKeyError)) throw e;
    ctx.logger.warn({ contentPlanId, provider: e.provider }, "planner.suggest_topics: немає ключа орендаря");
    return;
  }
  const models = builder(input.modelConfig);
  const { suggestions, stats } = await suggestTopics(
    { models },
    {
      company: input.company,
      pillars: input.pillars,
      slots: input.slots,
      existingTopics: input.existingTopics,
      modelId: input.modelConfig.models.strategist,
    },
  );

  // ── 3) КОРОТКА txn: розкласти теми по слотах ──
  if (suggestions.length > 0) {
    await withAccountScope(ctx, accountId, async (tx) => {
      for (const s of suggestions) {
        await tx
          .update(planEntries)
          .set({
            topic: s.topic,
            keyMessage: s.keyMessage,
            seoKeywords: s.seoKeywords,
            pillar: s.pillar,
            source: "ai_suggested",
          })
          .where(and(eq(planEntries.accountId, accountId), eq(planEntries.id, s.id)));
      }
    });
  }

  // Розбіжність між слотами і пропозиціями нормальна, але її причина має бути видимою:
  // «модель дала мало» і «дедуп відкинув багато» лікуються по-різному, а зовні виглядають однаково.
  ctx.logger.info(
    {
      contentPlanId,
      slots: input.slots.length,
      suggested: suggestions.length,
      claimed: stats.claimed,
      droppedUnknownId: stats.unknownId,
      droppedDuplicate: stats.duplicate,
    },
    "planner.suggest_topics persisted",
  );
}
