import { eq } from "drizzle-orm";
import type { Job } from "@forteq/shared";
import { companies, companySettings, contentPlans } from "@forteq/db";
import {
  draftBrandProfile,
  resolveModelConfig,
  slotModel,
  DEFAULT_MODELS,
  NotEnoughInputError,
  type ModelConfig,
} from "@forteq/pipeline";
import { withAccountScope, type HandlerContext } from "../composition.js";
import { fetchSiteText } from "../lib/fetchSiteText.js";
import { tenantModelsBuilder } from "../lib/tenantModels.js";

type OnboardingBootstrapJob = Extract<Job, { kind: "onboarding.bootstrap" }>;

/**
 * Хендлер job `onboarding.bootstrap` (§6 раунд 2) — чернетить бриф компанії з сайту або опису.
 *
 * Мета: новий користувач не має заповнювати 15 полів руками перед першою генерацією. Усе, що
 * тут записується, — ЧЕРНЕТКА для правки, а не факт.
 *
 * Стан пишемо в companies.bootstrap_status на кожному кроці: візард його поллить, і без цього
 * «ще працює» не відрізнити від «впало».
 *
 * Межа транзакцій (ADR-0010): короткі scoped-txn навколо БД, мережа й LLM — поза ними.
 */
export async function handleBootstrapOnboarding(
  job: OnboardingBootstrapJob,
  ctx: HandlerContext,
): Promise<void> {
  const { accountId, companyId } = job;
  ctx.logger.info({ companyId }, "onboarding.bootstrap");

  // ── 1) КОРОТКА txn: вхідні дані + позначка «працюю» ──
  const input = await withAccountScope(ctx, accountId, async (tx) => {
    const [company] = await tx.select().from(companies).where(eq(companies.id, companyId));
    if (!company) throw new Error(`onboarding.bootstrap: company ${companyId} не знайдено`);

    const [settings] = await tx
      .select()
      .from(companySettings)
      .where(eq(companySettings.companyId, companyId));

    await tx
      .update(companies)
      .set({ bootstrapStatus: "running", bootstrapError: null })
      .where(eq(companies.id, companyId));

    const snapshot: Partial<ModelConfig> | undefined = settings
      ? {
          provider: settings.provider as ModelConfig["provider"],
          models: settings.models ?? undefined,
        }
      : undefined;

    return {
      name: company.name,
      websiteUrl: company.websiteUrl,
      description: company.description,
      language: settings?.language ?? "uk",
      modelConfig: resolveModelConfig(snapshot, DEFAULT_MODELS),
    };
  });

  try {
    // ── 2) ПОЗА txn: мережа + LLM ──
    // Недоступний сайт не валить онбординг: лишається опис, а якщо нема й його — це вже помилка
    // вхідних даних, і draftBrandProfile скаже про це явно.
    const siteText = input.websiteUrl ? await fetchSiteText(input.websiteUrl) : null;
    if (input.websiteUrl && !siteText) {
      ctx.logger.warn({ companyId, url: input.websiteUrl }, "bootstrap: сайт недоступний");
    }

    // BYOK (§ADR-0016): чернетка брифу теж генерується ключем ОРЕНДАРЯ. Немає ключа →
    // NoTenantKeyError, який catch нижче кладе у bootstrap_status=failed з повідомленням «додайте ключ».
    const build = await tenantModelsBuilder(ctx, accountId, [
      slotModel(input.modelConfig, "researcher").provider,
    ]);
    const models = build(input.modelConfig);
    const { draft } = await draftBrandProfile(
      { models },
      {
        name: input.name,
        siteText: siteText ?? undefined,
        description: input.description ?? undefined,
        language: input.language,
        modelId: input.modelConfig.models.researcher,
      },
    );

    // ── 3) КОРОТКА txn: записати чернетку ──
    await withAccountScope(ctx, accountId, async (tx) => {
      await tx
        .update(companies)
        .set({
          positioning: draft.positioning,
          stack: draft.stack,
          services: draft.services,
          audience: draft.audience,
          bootstrapStatus: "done",
          bootstrapError: null,
        })
        .where(eq(companies.id, companyId));

      // Тон і візуальний стиль живуть у налаштуваннях. Пишемо лише те, що модель справді
      // витягла, — щоб не затерти null-ом уже введене людиною.
      if (draft.toneOfVoice || draft.visualStyle) {
        await tx
          .update(companySettings)
          .set({
            ...(draft.toneOfVoice ? { toneOfVoice: draft.toneOfVoice } : {}),
            ...(draft.visualStyle ? { visualStyle: draft.visualStyle } : {}),
          })
          .where(eq(companySettings.companyId, companyId));
      }

      // Пілари — вхід для планувальника. Домішуємо в config, не перезаписуючи решту.
      if (draft.pillars.length > 0) {
        const [plan] = await tx
          .select()
          .from(contentPlans)
          .where(eq(contentPlans.companyId, companyId));
        if (plan) {
          const config = (plan.config ?? {}) as Record<string, unknown>;
          await tx
            .update(contentPlans)
            .set({ config: { ...config, pillars: draft.pillars } })
            .where(eq(contentPlans.id, plan.id));
        }
      }
    });

    ctx.logger.info(
      {
        companyId,
        stack: draft.stack.length,
        services: draft.services.length,
        pillars: draft.pillars.length,
      },
      "onboarding.bootstrap persisted",
    );
  } catch (e) {
    // Помилку пишемо у СТАН, а не лише в лог: візард має показати людині, що сталося, і дати
    // заповнити бриф руками — інакше вона дивилась би на вічний спінер.
    const message =
      e instanceof NotEnoughInputError
        ? "Замало даних: додайте сайт або короткий опис компанії"
        : e instanceof Error
          ? e.message
          : String(e);
    await withAccountScope(ctx, accountId, async (tx) => {
      await tx
        .update(companies)
        .set({ bootstrapStatus: "failed", bootstrapError: message.slice(0, 500) })
        .where(eq(companies.id, companyId));
    });
    ctx.logger.error({ companyId, err: message }, "onboarding.bootstrap failed");
  }
}
