import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  contentItems,
  publications,
  serviceConnections,
  notifications,
  inboxItems,
  encryptSecret,
} from "@forteq/db";
import type { Job } from "@forteq/shared";
import { handlePublishContent } from "../src/handlers/publishContent";
import type { PublisherRegistry } from "../src/lib/publishers/registry";
import type { HandlerContext } from "../src/composition";

// Офлайн-тест хендлера content.publish: без Postgres/Redis/мережі. Фейкова tx повертає підготовлені
// рядки за таблицею й записує insert/update у пам'ять — так перевіряємо ІДЕМПОТЕНТНІСТЬ (skip вже
// опублікованого), порожній реєстр (failed "not implemented") та ІЗОЛЯЦІЮ помилок по таргету.

const MASTER_KEY = randomBytes(32); // AES-256 master-ключ для BYOK-крипто (реальний encrypt/decrypt)

// ── Стан фейкової БД + записи, що їх робить хендлер ────────────────────────────
interface FakeState {
  contentItems: Array<Record<string, unknown>>;
  publications: Array<{ contentItemId: string; provider: string; status: string }>;
  // Черга відповідей на select із service_connections — по одному запису на pending-таргет (у порядку).
  connectionQueue: Array<Array<Record<string, unknown>>>;
  writes: {
    publications: Array<Record<string, unknown>>;
    notifications: Array<Record<string, unknown>>;
    inbox: Array<Record<string, unknown>>;
    connUpdates: Array<Record<string, unknown>>;
  };
}

function makeConnectionRow(): Record<string, unknown> {
  return {
    accessTokenCt: encryptSecret("access-token", MASTER_KEY).ciphertext,
    refreshTokenCt: null,
    externalAccountId: "ext-account",
    expiresAt: null, // не протух → refreshIfNeeded не чіпає креди/мережу
    meta: {},
    status: "connected",
  };
}

// Фейковий db з .transaction — кожен виклик віддає tx, зв'язану зі спільним state.
function makeDb(state: FakeState) {
  function resolveSelect(table: unknown): unknown[] {
    if (table === contentItems) return state.contentItems;
    if (table === publications) return state.publications;
    if (table === serviceConnections) return state.connectionQueue.shift() ?? [];
    if (table === inboxItems) return []; // openInbox: перевірка існування → нема відкритих
    return [];
  }

  function recordInsert(table: unknown, values: Record<string, unknown>): void {
    if (table === publications) {
      state.writes.publications.push(values);
      // тримаємо state.publications консистентним (для ідемпотентності в межах одного прогону)
      state.publications.push({
        contentItemId: String(values.contentItemId),
        provider: String(values.provider),
        status: String(values.status),
      });
    } else if (table === notifications) state.writes.notifications.push(values);
    else if (table === inboxItems) state.writes.inbox.push(values);
  }

  function recordUpdate(table: unknown, values: Record<string, unknown>): void {
    if (table === serviceConnections) state.writes.connUpdates.push(values);
  }

  const makeTx = () => {
    const tx: Record<string, unknown> = {
      execute: async () => undefined, // set_config(...) — no-op
      select() {
        return {
          from(table: unknown) {
            const obj: Record<string, unknown> = {
              where() {
                return obj;
              },
              limit() {
                return obj;
              },
              then(onF: (v: unknown[]) => unknown, onR?: (e: unknown) => unknown) {
                return Promise.resolve()
                  .then(() => resolveSelect(table))
                  .then(onF, onR);
              },
            };
            return obj;
          },
        };
      },
      insert(table: unknown) {
        return {
          values(v: Record<string, unknown>) {
            let done = false;
            const rec = () => {
              if (!done) {
                done = true;
                recordInsert(table, v);
              }
            };
            return {
              onConflictDoUpdate() {
                rec();
                return Promise.resolve();
              },
              then(onF: () => unknown, onR?: (e: unknown) => unknown) {
                rec();
                return Promise.resolve().then(onF, onR);
              },
            };
          },
        };
      },
      update(table: unknown) {
        return {
          set(v: Record<string, unknown>) {
            return {
              where() {
                recordUpdate(table, v);
                return Promise.resolve();
              },
            };
          },
        };
      },
    };
    return tx;
  };

  return {
    transaction: async <T>(cb: (tx: unknown) => Promise<T>): Promise<T> => cb(makeTx()),
  };
}

function makeCtx(state: FakeState, publishers: PublisherRegistry): HandlerContext {
  const logger = { info() {}, warn() {}, error() {}, debug() {} };
  return {
    db: makeDb(state),
    logger,
    masterKey: MASTER_KEY,
    env: {
      PUBLIC_APP_URL: "https://app.test",
      PUBLIC_MEDIA_BASE_URL: "https://app.test/api",
    },
    imageStorage: { read: async () => Buffer.from("img") },
    publishers,
    pipeline: {},
  } as unknown as HandlerContext;
}

function makeState(overrides: Partial<FakeState> = {}): FakeState {
  return {
    contentItems: [],
    publications: [],
    connectionQueue: [],
    writes: { publications: [], notifications: [], inbox: [], connUpdates: [] },
    ...overrides,
  };
}

function item(id: string, channel: string): Record<string, unknown> {
  return { id, companyId: "company-1", channel, title: null, text: "hello", imageUrl: null };
}

function publishJob(targets: Array<{ itemId: string; provider: string }>): Job {
  return {
    kind: "content.publish",
    jobId: `publish-run1-${targets.map((t) => t.itemId).join("-")}`,
    accountId: "account-1",
    runId: "run-1",
    targets,
  } as Job;
}

describe("handlePublishContent", () => {
  it("ідемпотентність: пропускає вже опублікований таргет (нічого не публікує/не пише)", async () => {
    const state = makeState({
      contentItems: [item("i1", "linkedin")],
      publications: [{ contentItemId: "i1", provider: "linkedin", status: "published" }],
      // connectionQueue порожня: до читання конекшена не має дійти
    });
    const ctx = makeCtx(state, {});

    await handlePublishContent(publishJob([{ itemId: "i1", provider: "linkedin" }]), ctx);

    expect(state.writes.publications).toHaveLength(0);
    expect(state.writes.notifications).toHaveLength(0);
    expect(state.writes.inbox).toHaveLength(0);
    // Черга конекшенів не чіпалась — публікації не почалось.
    expect(state.connectionQueue).toHaveLength(0);
  });

  it("порожній реєстр публікаторів → публікація failed 'provider not implemented yet' + inbox", async () => {
    const state = makeState({
      contentItems: [item("i1", "linkedin")],
      publications: [],
      connectionQueue: [[makeConnectionRow()]],
    });
    const ctx = makeCtx(state, {}); // РЕЄСТР ПОРОЖНІЙ

    await handlePublishContent(publishJob([{ itemId: "i1", provider: "linkedin" }]), ctx);

    expect(state.writes.publications).toHaveLength(1);
    expect(state.writes.publications[0]).toMatchObject({
      contentItemId: "i1",
      provider: "linkedin",
      status: "failed",
      error: "provider not implemented yet",
    });
    // Невдача — actionable inbox-задача, без success-нотифікації.
    expect(state.writes.inbox).toHaveLength(1);
    expect(state.writes.notifications).toHaveLength(0);
  });

  it("ізоляція помилок: збій одного адаптера не валить job, другий публікується", async () => {
    const state = makeState({
      contentItems: [item("i1", "linkedin"), item("i2", "twitter")],
      publications: [],
      // Порядок відповідає порядку pending-таргетів: спершу linkedin, потім twitter.
      connectionQueue: [[makeConnectionRow()], [makeConnectionRow()]],
    });
    const publishers: PublisherRegistry = {
      linkedin: {
        publish: async () => ({ externalPostId: "post-1", externalUrl: "https://li/1" }),
      },
      twitter: {
        publish: async () => {
          throw new Error("boom");
        },
      },
    };
    const ctx = makeCtx(state, publishers);

    // Не має кидати, попри падіння twitter-адаптера.
    await expect(
      handlePublishContent(
        publishJob([
          { itemId: "i1", provider: "linkedin" },
          { itemId: "i2", provider: "twitter" },
        ]),
        ctx,
      ),
    ).resolves.toBeUndefined();

    expect(state.writes.publications).toHaveLength(2);
    const li = state.writes.publications.find((p) => p.contentItemId === "i1");
    const tw = state.writes.publications.find((p) => p.contentItemId === "i2");
    expect(li).toMatchObject({ status: "published", externalUrl: "https://li/1", externalPostId: "post-1" });
    expect(tw).toMatchObject({ status: "failed" });
    expect(String(tw?.error)).toContain("boom");
    // Один успіх → одна нотифікація; одна невдача → одна inbox-задача.
    expect(state.writes.notifications).toHaveLength(1);
    expect(state.writes.inbox).toHaveLength(1);
    // last_used_at оновлено лише для успішного конекшена (linkedin).
    expect(state.writes.connUpdates).toHaveLength(1);
  });
});
