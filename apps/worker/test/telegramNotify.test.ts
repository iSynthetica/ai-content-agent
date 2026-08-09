import { randomBytes } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { serviceConnections, encryptSecret } from "@forteq/db";
import { notifyTelegramReady } from "../src/lib/telegramNotify";
import type { HandlerContext } from "../src/composition";

// Офлайн-тест best-effort Telegram-пінга: без Postgres/Redis, fetch замокано. Перевіряємо, що при
// налаштованому конекшні шлемо коректний sendMessage (URL + payload), і що відсутність конекшена /
// збій HTTP нічого не кидають (інваріант notify.ts: сповіщення НЕ валить прогін).

const MASTER_KEY = randomBytes(32);
const BOT_TOKEN = "123456789:AAExampleTokenStringHere";
const CHAT_ID = "-1001234567890";

// Фейкова scoped-txn: віддає підготовлений рядок service_connections на select, ігнорує set_config.
function makeCtx(connRow: Record<string, unknown> | undefined): HandlerContext {
  const makeTx = () => ({
    execute: async () => undefined,
    select() {
      return {
        from(table: unknown) {
          const obj: Record<string, unknown> = {
            where: () => obj,
            limit: () => obj,
            then(onF: (v: unknown[]) => unknown, onR?: (e: unknown) => unknown) {
              const rows = table === serviceConnections && connRow ? [connRow] : [];
              return Promise.resolve(rows).then(onF, onR);
            },
          };
          return obj;
        },
      };
    },
  });
  const db = {
    transaction: async <T>(cb: (tx: unknown) => Promise<T>): Promise<T> => cb(makeTx()),
  };
  return {
    db,
    masterKey: MASTER_KEY,
    env: { PUBLIC_APP_URL: "https://saas.forteqsolution.com" },
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  } as unknown as HandlerContext;
}

function connectedRow(): Record<string, unknown> {
  return {
    tokenCt: encryptSecret(BOT_TOKEN, MASTER_KEY).ciphertext,
    chatId: CHAT_ID,
    status: "connected",
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("notifyTelegramReady", () => {
  it("шле sendMessage з коректним URL і payload (deep-link у кнопці)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await notifyTelegramReady(makeCtx(connectedRow()), "acc-1", "run-42");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`);
    expect(init.method).toBe("POST");
    const payload = JSON.parse(init.body as string);
    expect(payload.chat_id).toBe(CHAT_ID);
    expect(payload.parse_mode).toBe("HTML");
    expect(payload.link_preview_options).toEqual({ is_disabled: true });
    expect(payload.reply_markup.inline_keyboard[0][0].url).toBe(
      "https://saas.forteqsolution.com/runs/run-42",
    );
    expect(typeof payload.text).toBe("string");
  });

  it("без конекшена тихо виходить (fetch не викликається)", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await notifyTelegramReady(makeCtx(undefined), "acc-1", "run-42");

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("HTTP-збій не кидає (best-effort)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("bad", { status: 401 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      notifyTelegramReady(makeCtx(connectedRow()), "acc-1", "run-42"),
    ).resolves.toBeUndefined();
  });

  it("fake-режим (без masterKey) не шле нічого", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const ctx = makeCtx(connectedRow());
    (ctx as unknown as { masterKey?: Buffer }).masterKey = undefined;

    await notifyTelegramReady(ctx, "acc-1", "run-42");

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
