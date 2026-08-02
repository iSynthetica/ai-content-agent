// Composition root worker'а (spike-1 §13): ЄДИНЕ місце, де живуть секрети та конкретні адаптери.
// Тут збирається db-клієнт, РЕАЛЬНІ адаптери pipeline-портів (@forteq/pipeline), Postgres-checkpointer
// і job-scoped tenant-контекст (RLS). Барʼєр B2: справжній пайплайн під'єднано замість стабів.
import pino, { type Logger as PinoLogger } from "pino";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import type { BaseCheckpointSaver } from "@langchain/langgraph";
import { createDb, withAccountContext, parseMasterKey, type DB, type TenantContext } from "@forteq/db";
// РЕАЛЬНІ порти/типи пайплайна (§5) — локальні стаб-декларації прибрано (барʼєр B2).
import {
  type ImageStore,
  type ModelFactoryBuilder,
  type PipelineDeps,
  type WebSearchHit,
  type WebSearchTool,
} from "@forteq/pipeline";
import { createFakeModelFactory } from "./lib/fakeModelFactory.js";
import type { JobProducer } from "./queue.js";
import type { Env } from "./config/env.js";

// ── АДАПТЕРИ ПОРТІВ (РЕАЛЬНІ) ─────────────────────────────────────────────────

// ImageStore → локальний том (МВП, §5). Пише байти згенерованого зображення у IMAGE_DIR/runId/draftId.ext
// і повертає { url (file://abs), key (runId/draftId.ext) }. Байти НЕ кладуться у стан/checkpointer (§7.4).
class LocalImageStore implements ImageStore {
  constructor(private readonly dir: string) {}

  async put(
    bytes: Buffer,
    meta: { runId: string; draftId: string; contentType: string },
  ): Promise<{ url: string; key: string }> {
    const ext = extFromContentType(meta.contentType);
    const key = `${meta.runId}/${meta.draftId}.${ext}`;
    const abs = resolve(join(this.dir, key));
    await mkdir(dirname(abs), { recursive: true });
    await writeFile(abs, bytes);
    return { url: `file://${abs}`, key };
  }
}

function extFromContentType(ct: string): string {
  if (ct.includes("png")) return "png";
  if (ct.includes("jpeg") || ct.includes("jpg")) return "jpg";
  if (ct.includes("webp")) return "webp";
  return "bin";
}

// WebSearchTool → Tavily (§5, §7.1). РЕАЛЬНИЙ fetch. Порожній ключ АБО помилка мережі → повертаємо []
// (а не throw), щоб smoke/офлайн-прогін не падав через відсутній TAVILY_API_KEY.
class TavilyWebSearch implements WebSearchTool {
  constructor(
    private readonly apiKey: string | undefined,
    private readonly logger?: PinoLogger,
  ) {}

  async search(query: string, opts?: { maxResults?: number }): Promise<WebSearchHit[]> {
    if (!this.apiKey) return []; // ключа нема → тихо повертаємо порожній список (smoke)
    try {
      const res = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          api_key: this.apiKey, // сумісність зі старим контрактом Tavily
          query,
          max_results: opts?.maxResults ?? 5,
          search_depth: "basic",
        }),
      });
      if (!res.ok) {
        this.logger?.warn({ status: res.status }, "tavily search failed");
        return [];
      }
      const data = (await res.json()) as {
        results?: Array<{ title?: string; url?: string; content?: string }>;
      };
      return (data.results ?? []).map((r) => ({
        title: r.title ?? "",
        url: r.url ?? "",
        snippet: r.content ?? "",
      }));
    } catch (e) {
      this.logger?.warn({ err: e instanceof Error ? e.message : String(e) }, "tavily search error");
      return [];
    }
  }
}

// ── СИСТЕМНИЙ КОНТЕКСТ WORKER'А (RLS) ────────────────────────────────────────
// TODO(spike-2): справжня службова роль / системний user фонового worker'а.
const SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000000";
const WORKER_ROLE = "owner";

// ── DEPS ─────────────────────────────────────────────────────────────────────
export interface Deps {
  env: Env;
  db: DB;
  logger: PinoLogger;
  pipeline: PipelineDeps; // те, що піде у createPipeline(...) з @forteq/pipeline (§13)
  // BYOK master-ключ (§ADR-0016): розшифровує ключі провайдерів орендаря на момент виконання.
  // undefined у fake-режимі (ключі там не потрібні). Хендлери беруть його через ctx.masterKey.
  masterKey?: Buffer;
  // Продюсер follow-up job (§7.4): generation.start ставить content.visuals після персисту.
  // Інжектиться з main.ts (там живе redis-конект), тому опційний — тести його не потребують.
  producer?: JobProducer;
}

/** Job-scoped UnitOfWork handle (drizzle tx з уже виставленим RLS-GUC). TODO(spike-2): account-scoped репозиторії.
 *  Без `$client`: транзакція, яку віддає withAccountContext, не експонує клієнт (як DbExecutor у api). */
export type Tx = Omit<DB, "$client">;

// HandlerContext БЕЗ довгоживучого tx: тепер кожен хендлер відкриває ВЛАСНІ короткі scoped-txn
// через withAccountScope (щоб НЕ тримати транзакцію відкритою під час пайплайна — LLM ідуть хвилинами, §13).
export interface HandlerContext extends Deps {
  accountId: string;
}

/**
 * Збірка PipelineDeps + інфраструктури (spike-1 §13). Секрети резолвляться з env ОДИН раз і
 * замикаються у ModelFactoryBuilder — у пайплайн як env вони не потрапляють.
 * Барʼєр B2: адаптери РЕАЛЬНІ; models — реальний defaultModelFactory АБО фейк (FAKE_MODELS / без ключів).
 */
export function buildDeps(env: Env): Deps {
  const logger = pino({ level: env.LOG_LEVEL });
  const db = createDb(env.DATABASE_URL);

  // Фейкові моделі — ЛИШЕ за явним FAKE_MODELS=1 (детермінований плумбінг без LLM-викликів, §14).
  //
  // BYOK (§ADR-0016): реальний прогін бере ключ ОРЕНДАРЯ на момент виконання (tenantModelsBuilder),
  // тож платформенні LLM-ключі генерацію більше не живлять. У real-режимі потрібен лише master-ключ,
  // щоб розшифрувати ключ орендаря; його відсутність — фатальна помилка СТАРТУ (fail-fast).
  //
  // Історичний контекст (ADR-0014): колись відсутність ключа тихо перемикала на фейки, і в БД
  // лягало сміття, невідрізниме від справжнього. Тепер фейки — лише за явним прапорцем.
  const useFakeModels = env.FAKE_MODELS === "1";
  let masterKey: Buffer | undefined;
  if (useFakeModels) {
    logger.warn({}, "using FAKE ModelFactory (FAKE_MODELS=1, no real LLM calls)");
  } else {
    if (!env.BYOK_ENCRYPTION_KEY) {
      throw new Error(
        "BYOK_ENCRYPTION_KEY відсутній. Він потрібен для розшифрування ключів орендарів. " +
          "Задайте його або запустіть з FAKE_MODELS=1, якщо фейкові моделі — саме те, що потрібно.",
      );
    }
    masterKey = parseMasterKey(env.BYOK_ENCRYPTION_KEY);
  }

  // ModelFactoryBuilder. Fake: детерміновані фейки (+FAKE_STEP_DELAY_MS для видимого прогресу).
  // Real: глобальне будівництво ЗАБОРОНЕНЕ (кидає) — кожен шлях мусить будувати моделі на ключі
  // орендаря через tenantModelsBuilder. Так «block, no fallback» тримається навіть якщо якийсь
  // шлях забуде резолв: він упаде голосно, а не витратить платформенний ключ (§ADR-0016).
  const models: ModelFactoryBuilder = useFakeModels
    ? () => createFakeModelFactory({ stepDelayMs: env.FAKE_STEP_DELAY_MS })
    : () => {
        throw new Error(
          "BYOK: моделі будуються на ключі орендаря (tenantModelsBuilder), не глобально (§ADR-0016)",
        );
      };

  // Postgres checkpointer (§10): resume переживає рестарт/інший інстанс worker'а.
  // `.setup()` (створення checkpointer-таблиць) викликається у main.ts ПЕРЕД стартом Worker'а.
  const checkpointer: BaseCheckpointSaver = PostgresSaver.fromConnString(env.DATABASE_URL);

  const pipeline: PipelineDeps = {
    models,
    webSearch: new TavilyWebSearch(env.TAVILY_API_KEY, logger),
    imageStore: new LocalImageStore(env.IMAGE_DIR),
    checkpointer,
    logger,
  };

  return { env, db, logger, pipeline, masterKey };
}

/**
 * Job-scoped tenant-контекст (RLS, §13): відкриває КОРОТКУ транзакцію з SET LOCAL app.current_account_id
 * = accountId (через withAccountContext зі спайка 2). Усі фонові записи worker'а (content_items,
 * generation_runs, plan_entries) мусять іти ВСЕРЕДИНІ цього scope. Тверда межа: жодного доступу до БД
 * поза scoped-txn; і жодного тримання txn відкритою під час виконання графа (LLM — хвилини).
 * СТАБ: системний user/role — TODO(spike-2); передається raw-tx (замість account-scoped репозиторіїв).
 */
export function withAccountScope<T>(
  deps: Deps,
  accountId: string,
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  const ctx: TenantContext = { accountId, userId: SYSTEM_USER_ID, role: WORKER_ROLE };
  return withAccountContext(deps.db, ctx, fn);
}
