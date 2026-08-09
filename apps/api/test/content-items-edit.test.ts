// Unit — ContentItemsService.editItem/listVersions/revertItem (§content-editing). Fake repos на
// пам'яті (без БД, офлайн — §tests skill): перевіряємо саме те, що ламається мовчки — appen-only
// історію версій і те, що revert справді бере вміст ОБРАНОЇ версії, а не найновішої.
import { describe, expect, it, vi } from "vitest";
import type { Logger } from "pino";
import { ContentItemsService } from "../src/services/content-items.service";
import { AppError } from "../src/http/errors";
import type { AuthCtx } from "../src/di/types";
import type {
  ContentItem,
  ContentItemContentPatch,
  ContentItemsRepo,
  ContentItemVersion,
  ContentItemVersionsRepo,
  ItemStatus,
  ItemsQuery,
  NewContentItemVersion,
  RunsRepo,
} from "../src/repositories/interfaces";

const ACCOUNT = "11111111-1111-1111-1111-111111111111";
const ITEM_ID = "22222222-2222-2222-2222-222222222222";
const ctx: AuthCtx = { accountId: ACCOUNT, userId: "u1", role: "editor" };

// ── fakes ──────────────────────────────────────────────────────────────────
class FakeContentItemsRepo implements ContentItemsRepo {
  item: ContentItem = {
    id: ITEM_ID,
    runId: "run-1",
    channel: "linkedin",
    topic: "Мікросервіси",
    title: null,
    text: "Оригінальний текст.",
    scores: null,
    violations: null,
    imageUrl: null,
    status: "draft",
    version: 1,
  };

  async listByRun(_a: string, _r: string, _q: ItemsQuery): Promise<ContentItem[]> {
    return [this.item];
  }
  async findById(accountId: string, id: string): Promise<ContentItem | null> {
    if (accountId !== ACCOUNT || id !== this.item.id) return null;
    return this.item;
  }
  async updateStatus(_a: string, _id: string, status: ItemStatus): Promise<ContentItem | null> {
    this.item = { ...this.item, status };
    return this.item;
  }
  async updateContent(
    accountId: string,
    id: string,
    patch: ContentItemContentPatch,
  ): Promise<ContentItem | null> {
    if (accountId !== ACCOUNT || id !== this.item.id) return null;
    this.item = { ...this.item, text: patch.text, title: patch.title };
    return this.item;
  }
  async existsByImageUrl(accountId: string, imageUrl: string): Promise<boolean> {
    return accountId === ACCOUNT && this.item.imageUrl === imageUrl;
  }
}

class FakeVersionsRepo implements ContentItemVersionsRepo {
  rows: ContentItemVersion[] = [];
  private seq = 0;

  async insert(accountId: string, row: NewContentItemVersion): Promise<ContentItemVersion> {
    const v: ContentItemVersion = {
      id: `v${++this.seq}`,
      contentItemId: row.contentItemId,
      source: row.source,
      text: row.text,
      title: row.title ?? null,
      editorUserId: row.editorUserId ?? null,
      // Монотонний timestamp — детерміновано новіший за попередній запис (реальні мс могли б збігтись).
      createdAt: new Date(2026, 0, 1, 0, 0, this.seq).toISOString(),
    };
    // accountId лишень перевіряємо (RLS-еквівалент у фейку) — не зберігаємо окремим полем.
    if (accountId !== ACCOUNT) throw new Error("wrong account");
    this.rows.unshift(v); // найновіша перша, як у реальному репо (ORDER BY created_at DESC)
    return v;
  }
  async listByItem(accountId: string, contentItemId: string): Promise<ContentItemVersion[]> {
    if (accountId !== ACCOUNT) return [];
    return this.rows.filter((r) => r.contentItemId === contentItemId);
  }
  async findById(accountId: string, id: string): Promise<ContentItemVersion | null> {
    if (accountId !== ACCOUNT) return null;
    return this.rows.find((r) => r.id === id) ?? null;
  }
}

const fakeRuns = {} as RunsRepo; // не використовується жодним із тестованих методів
const noopAfterCommit = vi.fn();
const logger = { info: vi.fn(), error: vi.fn() } as unknown as Logger;

function build() {
  const items = new FakeContentItemsRepo();
  const versions = new FakeVersionsRepo();
  const service = new ContentItemsService(items, fakeRuns, versions, noopAfterCommit, logger);
  return { items, versions, service };
}

// ── тести ──────────────────────────────────────────────────────────────────
describe("ContentItemsService.editItem", () => {
  it("оновлює text/title айтема і пише source:'human' версію з editorUserId", async () => {
    const { items, versions, service } = build();

    const updated = await service.editItem(ctx, ITEM_ID, { text: "Нова версія тексту", title: "Заголовок" });

    expect(updated.text).toBe("Нова версія тексту");
    expect(updated.title).toBe("Заголовок");
    expect(items.item.text).toBe("Нова версія тексту");

    // Захист бази: айтем без версій → спершу знімок ОРИГІНАЛУ як 'generated', потім людська правка.
    const history = await versions.listByItem(ACCOUNT, ITEM_ID);
    expect(history).toHaveLength(2);
    expect(history[0]).toMatchObject({
      source: "human",
      text: "Нова версія тексту",
      title: "Заголовок",
      editorUserId: ctx.userId,
    });
    expect(history[1]).toMatchObject({ source: "generated", text: "Оригінальний текст." });
  });

  it("НЕ дублює базу, якщо 'generated' версія вже є (нові айтеми з worker-хука)", async () => {
    const { versions, service } = build();
    await versions.insert(ACCOUNT, { contentItemId: ITEM_ID, source: "generated", text: "Оригінальний текст." });
    await service.editItem(ctx, ITEM_ID, { text: "Правка" });
    const history = await versions.listByItem(ACCOUNT, ITEM_ID);
    expect(history.filter((v) => v.source === "generated")).toHaveLength(1); // без дубля бази
    expect(history[0]).toMatchObject({ source: "human", text: "Правка" });
  });

  it("title відсутній у тілі запиту → пишеться null, а не старе значення", async () => {
    const { versions, service } = build();
    await service.editItem(ctx, ITEM_ID, { text: "Текст без заголовка" });
    expect(versions.rows[0]?.title).toBeNull();
  });

  it("404 на неіснуючий айтем — до будь-якого запису в історію", async () => {
    const { versions, service } = build();
    await expect(
      service.editItem(ctx, "does-not-exist", { text: "x" }),
    ).rejects.toBeInstanceOf(AppError);
    expect(versions.rows).toHaveLength(0);
  });
});

describe("ContentItemsService.revertItem", () => {
  it("відновлює вміст ОБРАНОЇ версії (не останньої) і додає нову human-версію (append-only)", async () => {
    const { items, versions, service } = build();

    // Три версії: generated (перша) → дві людські правки.
    const v1 = await versions.insert(ACCOUNT, {
      contentItemId: ITEM_ID,
      source: "generated",
      text: "Версія 1 (згенерована)",
    });
    await versions.insert(ACCOUNT, {
      contentItemId: ITEM_ID,
      source: "human",
      text: "Версія 2 (правка)",
    });

    const reverted = await service.revertItem(ctx, ITEM_ID, v1.id);

    expect(reverted.text).toBe("Версія 1 (згенерована)");
    expect(items.item.text).toBe("Версія 1 (згенерована)");

    // Історія ДОДАЛА запис, а не видалила попередні — три записи, найновіший = revert-знімок.
    const history = await versions.listByItem(ACCOUNT, ITEM_ID);
    expect(history).toHaveLength(3);
    expect(history[0]).toMatchObject({ source: "human", text: "Версія 1 (згенерована)" });
    expect(history.map((h) => h.text)).toEqual([
      "Версія 1 (згенерована)",
      "Версія 2 (правка)",
      "Версія 1 (згенерована)",
    ]);
  });

  it("404 коли версія належить іншому айтему", async () => {
    const { versions, service } = build();
    const foreign = await versions.insert(ACCOUNT, {
      contentItemId: "other-item",
      source: "generated",
      text: "чужий текст",
    });

    await expect(service.revertItem(ctx, ITEM_ID, foreign.id)).rejects.toBeInstanceOf(AppError);
  });

  it("404 на неіснуючий versionId", async () => {
    const { service } = build();
    await expect(service.revertItem(ctx, ITEM_ID, "missing-version")).rejects.toBeInstanceOf(
      AppError,
    );
  });
});

describe("ContentItemsService.listVersions", () => {
  it("повертає найновішу версію першою", async () => {
    const { versions, service } = build();
    await versions.insert(ACCOUNT, { contentItemId: ITEM_ID, source: "generated", text: "перша" });
    await versions.insert(ACCOUNT, { contentItemId: ITEM_ID, source: "human", text: "друга" });

    const list = await service.listVersions(ctx, ITEM_ID);
    expect(list.map((v) => v.text)).toEqual(["друга", "перша"]);
  });

  it("404 на неіснуючий айтем", async () => {
    const { service } = build();
    await expect(service.listVersions(ctx, "does-not-exist")).rejects.toBeInstanceOf(AppError);
  });
});
