// Unit — RunConfigPresetsService (§Phase 5). Fake-репо на пам'яті: перевіряємо власність компанії,
// нормалізацію config схемою (відсіювання зайвого) і мапінг дубля імені (23505) у 409.
import { describe, expect, it } from "vitest";
import { AppError } from "../src/http/errors";
import { RunConfigPresetsService } from "../src/services/run-config-presets.service";
import type { AuthCtx } from "../src/di/types";
import type {
  CompaniesRepo,
  NewRunConfigPreset,
  RunConfigPreset,
  RunConfigPresetsRepo,
} from "../src/repositories/interfaces";

const ACCOUNT = "11111111-1111-1111-1111-111111111111";
const COMPANY = "22222222-2222-2222-2222-222222222222";
const ctx: AuthCtx = { accountId: ACCOUNT, userId: "u1", role: "editor" };

class FakePresetsRepo implements RunConfigPresetsRepo {
  rows: RunConfigPreset[] = [];
  private seq = 0;
  async listByCompany(): Promise<RunConfigPreset[]> {
    return this.rows;
  }
  async create(_a: string, data: NewRunConfigPreset): Promise<RunConfigPreset> {
    if (this.rows.some((r) => r.name === data.name)) {
      throw Object.assign(new Error("dup"), { code: "23505" }); // емулюємо unique-violation
    }
    const row: RunConfigPreset = {
      id: `p${++this.seq}`,
      name: data.name,
      config: data.config,
      createdAt: "2026-01-01T00:00:00.000Z",
    };
    this.rows.push(row);
    return row;
  }
  async deleteById(_a: string, id: string): Promise<boolean> {
    const before = this.rows.length;
    this.rows = this.rows.filter((r) => r.id !== id);
    return this.rows.length < before;
  }
}

const companies = (exists: boolean): CompaniesRepo =>
  ({ findById: async () => (exists ? ({ id: COMPANY } as never) : null) }) as unknown as CompaniesRepo;

describe("RunConfigPresetsService", () => {
  it("create нормалізує config (відсіює невідомі поля) і зберігає", async () => {
    const repo = new FakePresetsRepo();
    const svc = new RunConfigPresetsService(repo, companies(true));
    const p = await svc.create(ctx, COMPANY, {
      name: "Weekly",
      config: { channels: ["linkedin"], counts: { linkedin: 3 }, junk: "drop me" },
    });
    expect(p.config).toEqual({ channels: ["linkedin"], counts: { linkedin: 3 } });
    expect((p.config as Record<string, unknown>).junk).toBeUndefined();
  });

  it("дубль імені → 409 conflict", async () => {
    const repo = new FakePresetsRepo();
    const svc = new RunConfigPresetsService(repo, companies(true));
    await svc.create(ctx, COMPANY, { name: "Weekly", config: {} });
    await expect(svc.create(ctx, COMPANY, { name: "Weekly", config: {} })).rejects.toMatchObject({
      status: 409,
    });
  });

  it("невідома компанія → 404", async () => {
    const svc = new RunConfigPresetsService(new FakePresetsRepo(), companies(false));
    await expect(svc.list(ctx, COMPANY)).rejects.toBeInstanceOf(AppError);
    await expect(svc.list(ctx, COMPANY)).rejects.toMatchObject({ status: 404 });
  });

  it("delete неіснуючого → 404", async () => {
    const svc = new RunConfigPresetsService(new FakePresetsRepo(), companies(true));
    await expect(svc.remove(ctx, "nope")).rejects.toMatchObject({ status: 404 });
  });
});
