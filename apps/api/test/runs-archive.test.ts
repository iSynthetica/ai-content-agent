// Unit — RunsService.archiveRun/unarchiveRun/deleteRun (§run-archive). Fake RunsRepo на пам'яті
// (офлайн — §tests skill): перевіряємо саме те, що ламається мовчки — hard-delete-гвард «спершу
// архівуйте» (інакше випадковий клік знищив би активний прогін з усіма постами) та ортогональність
// архіву до статусу (archive НЕ рухає run_status).
import { describe, expect, it, vi } from "vitest";
import type { Logger } from "pino";
import { RunsService } from "../src/services/runs.service";
import { AppError } from "../src/http/errors";
import type { AuthCtx } from "../src/di/types";
import type {
  ApiKeysRepo,
  CompaniesRepo,
  ContentItemsRepo,
  ContentPlansRepo,
  PlanEntriesRepo,
  RunDecisionRow,
  RunListFilter,
  RunsRepo,
  RunStatus,
  RunSummary,
  SettingsRepo,
} from "../src/repositories/interfaces";

const ACCOUNT = "11111111-1111-1111-1111-111111111111";
const RUN_ID = "22222222-2222-2222-2222-222222222222";
const ctx: AuthCtx = { accountId: ACCOUNT, userId: "u1", role: "owner" };

// ── fake RunsRepo (лише те, що потрібно тестованим методам) ───────────────────
class FakeRunsRepo implements RunsRepo {
  run: RunSummary = {
    id: RUN_ID,
    companyId: "c1",
    status: "needs_review" as RunStatus,
    scheduledFor: null,
    costCents: 0,
    createdAt: new Date(2026, 0, 1).toISOString(),
    archivedAt: null,
  };
  deleted = false;

  async create(): Promise<{ id: string }> {
    throw new Error("not used");
  }
  async findById(accountId: string, id: string): Promise<RunSummary | null> {
    if (accountId !== ACCOUNT || id !== this.run.id || this.deleted) return null;
    return this.run;
  }
  async listByCompany(): Promise<never> {
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
  async setArchivedAt(accountId: string, id: string, value: Date | null): Promise<RunSummary | null> {
    if (accountId !== ACCOUNT || id !== this.run.id) return null;
    this.run = { ...this.run, archivedAt: value ? value.toISOString() : null };
    return this.run;
  }
  async deleteById(accountId: string, id: string): Promise<boolean> {
    if (accountId !== ACCOUNT || id !== this.run.id) return false;
    this.deleted = true;
    return true;
  }
  // фільтр не тестуємо тут (це шлях listByCompany); лишаємо для повноти інтерфейсу.
  _filter?: RunListFilter;
}

const logger = { info: vi.fn(), error: vi.fn() } as unknown as Logger;

function build() {
  const runs = new FakeRunsRepo();
  const service = new RunsService(
    runs,
    {} as CompaniesRepo,
    {} as SettingsRepo,
    {} as ContentPlansRepo,
    {} as PlanEntriesRepo,
    {} as ContentItemsRepo,
    {} as ApiKeysRepo,
    vi.fn(),
    logger,
  );
  return { runs, service };
}

describe("RunsService.archiveRun / unarchiveRun", () => {
  it("archive виставляє archivedAt (в архів), не чіпаючи статус", async () => {
    const { runs, service } = build();
    const updated = await service.archiveRun(ctx, RUN_ID);
    expect(updated.archivedAt).not.toBeNull();
    expect(updated.status).toBe("needs_review"); // архів ортогональний до run_status
    expect(runs.run.archivedAt).not.toBeNull();
  });

  it("unarchive скидає archivedAt назад у null", async () => {
    const { runs, service } = build();
    await service.archiveRun(ctx, RUN_ID);
    const restored = await service.unarchiveRun(ctx, RUN_ID);
    expect(restored.archivedAt).toBeNull();
    expect(runs.run.archivedAt).toBeNull();
  });

  it("404 на неіснуючий прогін", async () => {
    const { service } = build();
    await expect(service.archiveRun(ctx, "does-not-exist")).rejects.toBeInstanceOf(AppError);
    await expect(service.unarchiveRun(ctx, "does-not-exist")).rejects.toBeInstanceOf(AppError);
  });
});

describe("RunsService.deleteRun", () => {
  it("422 коли прогін НЕ архівований — гвард «спершу архівуйте» (нічого не видаляє)", async () => {
    const { runs, service } = build();
    await expect(service.deleteRun(ctx, RUN_ID)).rejects.toMatchObject({ code: "unprocessable" });
    expect(runs.deleted).toBe(false);
  });

  it("видаляє прогін після архівації", async () => {
    const { runs, service } = build();
    await service.archiveRun(ctx, RUN_ID);
    await service.deleteRun(ctx, RUN_ID);
    expect(runs.deleted).toBe(true);
  });

  it("404 на неіснуючий прогін — до перевірки архіву", async () => {
    const { service } = build();
    await expect(service.deleteRun(ctx, "does-not-exist")).rejects.toBeInstanceOf(AppError);
  });
});
