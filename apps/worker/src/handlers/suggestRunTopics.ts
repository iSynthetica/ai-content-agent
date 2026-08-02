import { and, eq } from "drizzle-orm";
import type { Channel, Job } from "@forteq/shared";
import { companies, companySettings, runTopicDrafts } from "@forteq/db";
import {
  suggestTopics,
  resolveModelConfig,
  slotModel,
  DEFAULT_MODELS,
  type CompanyContext,
  type ModelConfig,
  type TopicSlot,
} from "@forteq/pipeline";
import { withAccountScope, type HandlerContext } from "../composition.js";
import { NoTenantKeyError, tenantModelsBuilder } from "../lib/tenantModels.js";

type SuggestRunTopicsJob = Extract<Job, { kind: "runtopics.suggest" }>;

// Форма draft.input (записана api-сервісом при створенні чернетки) — дзеркалить
// suggestRunTopicsRequest із @forteq/shared, але тут читається як «сире» jsonb.
interface DraftInput {
  channels: Channel[];
  counts: Record<string, number>;
  angle?: string;
}

/**
 * Хендлер job `runtopics.suggest` (topic preview, ad-hoc прогін) — AI пропонує теми ще ДО запуску
 * генерації, людина їх редагує, і вже затверджений список іде у звичайний createRun.topics.
 *
 * На відміну від `planner.suggest_topics`, тут немає content_plan/plan_entries — цільові «слоти»
 * СИНТЕТИЧНІ: по одному на кожну заявлену к-сть у draft.input.counts[channel], без дати й без
 * прив'язки до жодного вже існуючого рядка. Дедуп/пілари не мають сенсу для одноразового
 * ad-hoc запиту, тож ідуть порожніми — пропозиція спирається лише на контекст компанії й кут.
 *
 * Межа транзакцій (ADR-0010): короткий scoped-read → LLM ПОЗА txn → короткий scoped-write.
 */
export async function handleSuggestRunTopics(
  job: SuggestRunTopicsJob,
  ctx: HandlerContext,
): Promise<void> {
  const { accountId, companyId, draftId } = job;
  ctx.logger.info({ draftId, companyId }, "runtopics.suggest");

  // ── 1) КОРОТКА txn: чернетка + контекст компанії + синтетичні слоти ──
  // Ідемпотентність (§background-job skill): jobId детермінований (`runtopics-${draftId}`) — BullMQ
  // дедуплікує ЧЕСНИЙ повторний enqueue. Але redelivery/retry ПІСЛЯ того, як draft уже 'ready'/'failed',
  // дедуп не ловить (той самий jobId уже completed) — без guard'а такий retry тихо оплатив би ДРУГИЙ
  // LLM-виклик і затер би те, що вже показане людині. `null` = уже оброблено, вихід без роботи.
  const input = await withAccountScope(ctx, accountId, async (tx) => {
    const [draft] = await tx
      .select()
      .from(runTopicDrafts)
      .where(and(eq(runTopicDrafts.accountId, accountId), eq(runTopicDrafts.id, draftId)));
    if (!draft) throw new Error(`runtopics.suggest: draft ${draftId} не знайдено`);
    if (draft.status !== "pending") return null;

    const [company] = await tx.select().from(companies).where(eq(companies.id, companyId));
    if (!company) throw new Error(`runtopics.suggest: company ${companyId} не знайдено`);

    const [settings] = await tx
      .select()
      .from(companySettings)
      .where(eq(companySettings.companyId, companyId));

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
      language: settings?.language ?? "en",
    };

    const draftInput = draft.input as unknown as DraftInput;
    // Синтетичні слоти: id кодує channel+порядковий номер, щоб зіставити відповідь моделі назад
    // на канал (suggestTopics повертає id — тут це НЕ id рядка БД, лише мітка слота в межах запиту).
    const slots: TopicSlot[] = [];
    for (const channel of draftInput.channels ?? []) {
      const n = draftInput.counts?.[channel] ?? 0;
      for (let i = 0; i < n; i++) slots.push({ id: `${channel}-${i}`, channel, date: null });
    }

    const snapshot: Partial<ModelConfig> | undefined = settings
      ? {
          provider: settings.provider as ModelConfig["provider"],
          models: settings.models ?? undefined,
        }
      : undefined;

    return {
      company: companyContext,
      slots,
      modelConfig: resolveModelConfig(snapshot, DEFAULT_MODELS),
    };
  });

  if (input === null) {
    ctx.logger.info({ draftId }, "runtopics.suggest: чернетка вже оброблена, retry-guard");
    return;
  }

  if (input.slots.length === 0) {
    // Порожній запит (0 каналів/лічильників) — це помилка вхідних даних, а не тиха відсутність
    // результату: api вже мала б це відсіяти, але handler не покладається на це мовчки.
    await markFailed(ctx, accountId, draftId, "Немає каналів або кількостей для підбору тем");
    ctx.logger.warn({ draftId }, "runtopics.suggest: порожній запит");
    return;
  }

  // ── 2) ПОЗА txn: BYOK-резолв ключа орендаря + LLM ──
  // На відміну від planner.suggest_topics (де відсутність ключа лише лишає слоти порожніми —
  // планер вторинний), тут це ЄДИНА дія job — тож відсутність ключа фейлить чернетку явно,
  // щоб людина побачила причину замість вічного "pending" в UI.
  let builder;
  try {
    builder = await tenantModelsBuilder(ctx, accountId, [
      slotModel(input.modelConfig, "strategist").provider,
    ]);
  } catch (e) {
    if (!(e instanceof NoTenantKeyError)) throw e;
    await markFailed(ctx, accountId, draftId, e.message);
    ctx.logger.warn({ draftId, provider: e.provider }, "runtopics.suggest: немає ключа орендаря");
    return;
  }

  try {
    const models = builder(input.modelConfig);
    const { suggestions, stats } = await suggestTopics(
      { models },
      {
        company: input.company,
        pillars: [],
        slots: input.slots,
        existingTopics: [],
        modelId: input.modelConfig.models.strategist,
      },
    );

    const bySlotId = new Map(input.slots.map((s) => [s.id, s]));
    const topics = suggestions
      .map((s) => {
        const slot = bySlotId.get(s.id);
        if (!slot) return null;
        return {
          channel: slot.channel,
          topic: s.topic,
          keyMessage: s.keyMessage,
          seoKeywords: s.seoKeywords,
        };
      })
      .filter((t): t is NonNullable<typeof t> => t !== null);

    // ── 3) КОРОТКА txn: записати результат ──
    await withAccountScope(ctx, accountId, async (tx) => {
      await tx
        .update(runTopicDrafts)
        .set({ status: "ready", topics, error: null })
        .where(and(eq(runTopicDrafts.accountId, accountId), eq(runTopicDrafts.id, draftId)));
    });

    ctx.logger.info(
      { draftId, slots: input.slots.length, suggested: topics.length, claimed: stats.claimed },
      "runtopics.suggest persisted",
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await markFailed(ctx, accountId, draftId, message);
    ctx.logger.error({ draftId, err: message }, "runtopics.suggest failed");
  }
}

async function markFailed(
  ctx: HandlerContext,
  accountId: string,
  draftId: string,
  message: string,
): Promise<void> {
  await withAccountScope(ctx, accountId, async (tx) => {
    await tx
      .update(runTopicDrafts)
      .set({ status: "failed", error: message.slice(0, 500) })
      .where(and(eq(runTopicDrafts.accountId, accountId), eq(runTopicDrafts.id, draftId)));
  });
}
