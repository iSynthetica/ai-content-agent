// Unit — PublicationsService (§publishing §3). Ламається мовчки саме тут: якщо гвард «лише approved»
// або «канал має publish-таргет» протече, api поставить job на несхвалений/blog-контент, і worker
// або впаде, або (гірше) опублікує чернетку. Тому перевіряємо guardrail-и + що enqueue — after-commit,
// а не всередині txn (§2.10.3). Фейки на пам'яті, офлайн (tests skill).
import { describe, expect, it, vi } from "vitest";
import type { Logger } from "pino";
import { PublicationsService } from "../src/services/publications.service";
import { AppError } from "../src/http/errors";
import type { AuthCtx } from "../src/di/types";
import type {
  Channel,
  ContentItem,
  ContentItemContentPatch,
  ContentItemsRepo,
  ItemsQuery,
  ItemStatus,
  NewPendingPublication,
  NewRun,
  Paged,
  PublicationRow,
  PublicationsRepo,
  RunDecisionRow,
  RunListFilter,
  RunStatus,
  RunSummary,
  RunsRepo,
} from "../src/repositories/interfaces";

const ACCOUNT = "11111111-1111-1111-1111-111111111111";
const RUN = "22222222-2222-2222-2222-222222222222";
const OTHER_RUN = "99999999-9999-9999-9999-999999999999";
const ctx: AuthCtx = { accountId: ACCOUNT, userId: "u1", role: "editor" };

function makeItem(over: Partial<ContentItem> & { id: string }): ContentItem {
  return {
    runId: RUN,
    channel: "linkedin" as Channel,
    topic: null,
    title: null,
    text: "hello",
    scores: null,
    violations: null,
    imageUrl: null,
    status: "approved" as ItemStatus,
    version: 1,
    ...over,
  };
}

class FakeRunsRepo implements RunsRepo {
  exists = true;
  async create(_d: NewRun): Promise<{ id: string }> {
    throw new Error("not used");
  }
  async findById(accountId: string, id: string): Promise<RunSummary | null> {
    if (!this.exists || accountId !== ACCOUNT || id !== RUN) return null;
    return {
      id: RUN,
      companyId: "c1",
      status: "needs_review" as RunStatus,
      scheduledFor: null,
      costCents: 0,
      createdAt: new Date().toISOString(),
    };
  }
  async listByCompany(_a: string, _c: string, _f: RunListFilter): Promise<Paged<RunSummary>> {
    throw new Error("not used");
  }
  async countActiveByCompany(): Promise<number> {
    throw new Error("not used");
  }
  async getForDecision(): Promise<RunDecisionRow | null> {
    throw new Error("not used");
  }
  async updateStatus(): Promise<void> {
    throw new Error("not used");
  }
}

class FakeContentItemsRepo implements ContentItemsRepo {
  items = new Map<string, ContentItem>();
  async listByRun(_a: string, _r: string, _q: ItemsQuery): Promise<ContentItem[]> {
    throw new Error("not used");
  }
  async findById(accountId: string, id: string): Promise<ContentItem | null> {
    if (accountId !== ACCOUNT) return null;
    return this.items.get(id) ?? null;
  }
  async updateStatus(): Promise<ContentItem | null> {
    throw new Error("not used");
  }
  async updateContent(_a: string, _id: string, _p: ContentItemContentPatch): Promise<ContentItem | null> {
    throw new Error("not used");
  }
  async existsByImageUrl(): Promise<boolean> {
    throw new Error("not used");
  }
}

class FakePublicationsRepo implements PublicationsRepo {
  pending: NewPendingPublication[] | null = null;
  rows: PublicationRow[] = [];
  async listByRun(_a: string, _r: string): Promise<PublicationRow[]> {
    return this.rows;
  }
  async upsertPending(_a: string, items: NewPendingPublication[]): Promise<void> {
    this.pending = items;
    this.rows = items.map((it, i) => ({
      id: `pub-${i}`,
      contentItemId: it.contentItemId,
      provider: it.provider,
      status: "pending",
      externalUrl: null,
      error: null,
      publishedAt: null,
      createdAt: new Date().toISOString(),
    }));
  }
}

const logger = { info: vi.fn(), error: vi.fn() } as unknown as Logger;

function build() {
  const runs = new FakeRunsRepo();
  const items = new FakeContentItemsRepo();
  const pubs = new FakePublicationsRepo();
  const hooks: Array<() => Promise<void>> = [];
  const fakeQueue = { enqueuePublish: vi.fn().mockResolvedValue({ jobId: "publish-x" }) };
  const afterCommit = vi.fn((hook: (scope: never) => Promise<void>) => {
    hooks.push(() =>
      hook({ repos: {}, ports: { queue: fakeQueue, imageStorage: {} }, logger } as never),
    );
  });
  const service = new PublicationsService(pubs, runs, items, afterCommit, logger);
  return { runs, items, pubs, hooks, fakeQueue, afterCommit, service };
}

describe("PublicationsService.publish", () => {
  it("щасливий шлях: approved соц-айтем → pending + after-commit enqueuePublish (не одразу)", async () => {
    const { items, pubs, afterCommit, hooks, fakeQueue, service } = build();
    items.items.set("i1", makeItem({ id: "i1", channel: "linkedin" as Channel }));

    const res = await service.publish(ctx, RUN, ["i1"]);

    expect(pubs.pending).toEqual([{ contentItemId: "i1", runId: RUN, provider: "linkedin" }]);
    expect(res.items).toHaveLength(1);
    expect(res.items[0]!.status).toBe("pending");

    // enqueue лише зареєстровано як хук — не викликано в тілі txn.
    expect(afterCommit).toHaveBeenCalledTimes(1);
    expect(fakeQueue.enqueuePublish).not.toHaveBeenCalled();
    await hooks[0]!();
    expect(fakeQueue.enqueuePublish).toHaveBeenCalledWith({
      accountId: ACCOUNT,
      runId: RUN,
      targets: [{ itemId: "i1", provider: "linkedin" }],
    });
  });

  it("422 + БЕЗ запису: blog-канал не має publish-таргета", async () => {
    const { items, pubs, service } = build();
    items.items.set("b1", makeItem({ id: "b1", channel: "blog" as Channel }));
    await expect(service.publish(ctx, RUN, ["b1"])).rejects.toMatchObject({ status: 422 });
    expect(pubs.pending).toBeNull();
  });

  it("422: айтем не approved (draft)", async () => {
    const { items, service } = build();
    items.items.set("d1", makeItem({ id: "d1", status: "draft" as ItemStatus }));
    await expect(service.publish(ctx, RUN, ["d1"])).rejects.toMatchObject({ status: 422 });
  });

  it("422: айтем належить іншому прогону", async () => {
    const { items, service } = build();
    items.items.set("x1", makeItem({ id: "x1", runId: OTHER_RUN }));
    await expect(service.publish(ctx, RUN, ["x1"])).rejects.toMatchObject({ status: 422 });
  });

  it("404: неіснуючий прогін", async () => {
    const { runs, service } = build();
    runs.exists = false;
    await expect(service.publish(ctx, RUN, ["i1"])).rejects.toMatchObject({ status: 404 });
  });

  it("404: неіснуючий айтем", async () => {
    const { service } = build();
    await expect(service.publish(ctx, RUN, ["missing"])).rejects.toBeInstanceOf(AppError);
  });
});

describe("PublicationsService.listPublications", () => {
  it("404 на неіснуючий прогін", async () => {
    const { runs, service } = build();
    runs.exists = false;
    await expect(service.listPublications(ctx, RUN)).rejects.toMatchObject({ status: 404 });
  });

  it("повертає per-run рядки", async () => {
    const { pubs, service } = build();
    pubs.rows = [
      {
        id: "p1",
        contentItemId: "i1",
        provider: "twitter",
        status: "published",
        externalUrl: "https://x.com/1",
        error: null,
        publishedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      },
    ];
    const res = await service.listPublications(ctx, RUN);
    expect(res.items).toHaveLength(1);
    expect(res.items[0]!.provider).toBe("twitter");
    expect(res.items[0]!.status).toBe("published");
  });
});
