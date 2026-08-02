// Unit — RunTopicDraftsService (topic preview, §runtopics). Fake repos на пам'яті (офлайн, §tests
// skill): перевіряємо саме те, що по-справжньому ламається мовчки — guardrail-и на вхід (порожньо/
// забагато тем), fast-fail без ключа провайдера (щоб не платити за enqueue, який worker одразу
// зафейлить), і що enqueue справді реєструється як after-commit-хук, а не одразу.
import { describe, expect, it, vi } from "vitest";
import type { Logger } from "pino";
import { MAX_POSTS_PER_RUN } from "@forteq/shared";
import { RunTopicDraftsService } from "../src/services/run-topic-drafts.service";
import { AppError } from "../src/http/errors";
import type { AuthCtx } from "../src/di/types";
import type {
  ApiKeysRepo,
  Company,
  CompaniesRepo,
  CompanyPatch,
  CompanySettings,
  NewCompany,
  NewTopicDraft,
  PageParams,
  Paged,
  SettingsPatch,
  SettingsRepo,
  TopicDraft,
  TopicDraftsRepo,
} from "../src/repositories/interfaces";

const ACCOUNT = "11111111-1111-1111-1111-111111111111";
const COMPANY = "22222222-2222-2222-2222-222222222222";
const DRAFT = "33333333-3333-3333-3333-333333333333";
const ctx: AuthCtx = { accountId: ACCOUNT, userId: "u1", role: "editor" };

// ── fakes ──────────────────────────────────────────────────────────────────
class FakeCompaniesRepo implements CompaniesRepo {
  exists = true;
  async create(_a: string, _d: NewCompany): Promise<Company> {
    throw new Error("not used");
  }
  async getBootstrapState() {
    return null;
  }
  async findById(accountId: string, id: string): Promise<Company | null> {
    if (!this.exists || accountId !== ACCOUNT || id !== COMPANY) return null;
    return {
      id: COMPANY,
      name: "Acme",
      positioning: null,
      websiteUrl: null,
      description: null,
      stack: [],
      services: [],
      audience: null,
    };
  }
  async list(_a: string, _p: PageParams): Promise<Paged<Company>> {
    throw new Error("not used");
  }
  async listByAccount(): Promise<Company[]> {
    return [];
  }
  async update(_a: string, _id: string, _p: CompanyPatch): Promise<Company | null> {
    throw new Error("not used");
  }
  async delete(): Promise<boolean> {
    throw new Error("not used");
  }
}

class FakeSettingsRepo implements SettingsRepo {
  settings: CompanySettings | null = {
    companyId: COMPANY,
    toneOfVoice: null,
    toneExamples: [],
    visualStyle: null,
    forbiddenPhrases: [],
    language: "en",
    provider: "openai",
    models: null,
    agentModels: null,
  };
  async getByCompany(accountId: string, companyId: string): Promise<CompanySettings | null> {
    if (accountId !== ACCOUNT || companyId !== COMPANY) return null;
    return this.settings;
  }
  async upsert(_a: string, _c: string, _p: SettingsPatch): Promise<CompanySettings> {
    throw new Error("not used");
  }
}

class FakeApiKeysRepo implements ApiKeysRepo {
  present = new Set<string>(["openai"]);
  async list() {
    return [];
  }
  async upsert(): Promise<void> {}
  async delete(): Promise<boolean> {
    return true;
  }
  async exists(_accountId: string, provider: string): Promise<boolean> {
    return this.present.has(provider);
  }
}

class FakeTopicDraftsRepo implements TopicDraftsRepo {
  created: NewTopicDraft | null = null;
  row: TopicDraft | null = null;
  async create(accountId: string, data: NewTopicDraft): Promise<{ id: string }> {
    if (accountId !== ACCOUNT) throw new Error("wrong account");
    this.created = data;
    this.row = { id: DRAFT, status: "pending", topics: null, error: null };
    return { id: DRAFT };
  }
  async findByCompanyAndId(accountId: string, companyId: string, id: string): Promise<TopicDraft | null> {
    if (accountId !== ACCOUNT || companyId !== COMPANY || id !== this.row?.id) return null;
    return this.row;
  }
}

const logger = { info: vi.fn(), error: vi.fn() } as unknown as Logger;

function build() {
  const companies = new FakeCompaniesRepo();
  const settings = new FakeSettingsRepo();
  const apiKeys = new FakeApiKeysRepo();
  const drafts = new FakeTopicDraftsRepo();
  const hooks: Array<() => Promise<void>> = [];
  const afterCommit = vi.fn((hook: (scope: never) => Promise<void>) => {
    hooks.push(() => hook({ repos: {}, ports: { queue: fakeQueue, imageStorage: {} }, logger } as never));
  });
  const fakeQueue = {
    enqueueRun: vi.fn(),
    enqueueBootstrap: vi.fn(),
    enqueueSuggestTopics: vi.fn(),
    enqueueSuggestRunTopics: vi.fn().mockResolvedValue({ jobId: "j1" }),
  };
  const service = new RunTopicDraftsService(drafts, companies, settings, apiKeys, afterCommit, logger);
  return { companies, settings, apiKeys, drafts, afterCommit, hooks, fakeQueue, service };
}

// ── тести ──────────────────────────────────────────────────────────────────
describe("RunTopicDraftsService.requestSuggestions", () => {
  it("щасливий шлях: створює pending-чернетку і реєструє enqueue як after-commit-хук", async () => {
    const { drafts, afterCommit, hooks, fakeQueue, service } = build();

    const result = await service.requestSuggestions(ctx, COMPANY, {
      channels: ["linkedin", "twitter"],
      counts: { linkedin: 3, twitter: 2 },
      angle: "фокус на автоматизацію",
    });

    expect(result).toEqual({ draftId: DRAFT });
    expect(drafts.created).toEqual({
      companyId: COMPANY,
      input: { channels: ["linkedin", "twitter"], counts: { linkedin: 3, twitter: 2 }, angle: "фокус на автоматизацію" },
    });

    // Enqueue НЕ викликається одразу — лише хук зареєстровано (§2.10.3: enqueue строго після COMMIT).
    expect(afterCommit).toHaveBeenCalledTimes(1);
    expect(fakeQueue.enqueueSuggestRunTopics).not.toHaveBeenCalled();

    await hooks[0]!();
    expect(fakeQueue.enqueueSuggestRunTopics).toHaveBeenCalledWith({
      accountId: ACCOUNT,
      companyId: COMPANY,
      draftId: DRAFT,
    });
  });

  it("404 на неіснуючу компанію", async () => {
    const { companies, service } = build();
    companies.exists = false;
    await expect(
      service.requestSuggestions(ctx, COMPANY, { channels: ["linkedin"], counts: { linkedin: 1 } }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("422 коли компанія без settings", async () => {
    const { settings, service } = build();
    settings.settings = null;
    await expect(
      service.requestSuggestions(ctx, COMPANY, { channels: ["linkedin"], counts: { linkedin: 1 } }),
    ).rejects.toMatchObject({ status: 422 });
  });

  it("422 коли сумарна кількість тем — нуль (канал вказаний, лічильник 0/відсутній)", async () => {
    const { service } = build();
    await expect(
      service.requestSuggestions(ctx, COMPANY, { channels: ["linkedin"], counts: {} }),
    ).rejects.toBeInstanceOf(AppError);
  });

  it(`422 коли сума перевищує MAX_POSTS_PER_RUN (${MAX_POSTS_PER_RUN})`, async () => {
    const { service } = build();
    await expect(
      service.requestSuggestions(ctx, COMPANY, {
        channels: ["linkedin"],
        counts: { linkedin: MAX_POSTS_PER_RUN + 1 },
      }),
    ).rejects.toMatchObject({ status: 422 });
  });

  it("422 fast-fail, коли немає ключа провайдера — без запису чернетки", async () => {
    const { apiKeys, drafts, service } = build();
    apiKeys.present.clear();
    await expect(
      service.requestSuggestions(ctx, COMPANY, { channels: ["linkedin"], counts: { linkedin: 1 } }),
    ).rejects.toMatchObject({ status: 422 });
    expect(drafts.created).toBeNull(); // перевірка ключа — ДО insert, не марнуємо job на приречений запуск
  });

  it("провайдер береться з per-slot agentModels.strategist, коли він заданий", async () => {
    const { settings, apiKeys, service } = build();
    settings.settings = { ...settings.settings!, provider: "openai", agentModels: { strategist: { provider: "anthropic", model: "x" } } };
    apiKeys.present = new Set(["anthropic"]); // openai відсутній, але strategist override — anthropic
    await expect(
      service.requestSuggestions(ctx, COMPANY, { channels: ["linkedin"], counts: { linkedin: 1 } }),
    ).resolves.toEqual({ draftId: DRAFT });
  });
});

describe("RunTopicDraftsService.getDraft", () => {
  it("повертає стан чернетки, скоуплений і на account, і на company", async () => {
    const { drafts, service } = build();
    drafts.row = { id: DRAFT, status: "ready", topics: [{ channel: "linkedin", topic: "X" }], error: null };
    const draft = await service.getDraft(ctx, COMPANY, DRAFT);
    expect(draft.status).toBe("ready");
    expect(draft.topics).toEqual([{ channel: "linkedin", topic: "X" }]);
  });

  it("404 на неіснуючу чернетку", async () => {
    const { service } = build();
    await expect(service.getDraft(ctx, COMPANY, "missing")).rejects.toMatchObject({ status: 404 });
  });
});
