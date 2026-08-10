// Unit — ApiKeysService company-scoped (§per-company-settings). Ламається мовчки: якщо сервіс
// перестане передавати companyId у repo, у multi-company акаунті ключі однієї компанії протекли б в
// іншу (unique тепер (company_id, provider)). Тому перевіряємо, що companyId реально доходить до repo
// на list/set/remove, ключ шифрується на запис, а чужа/неіснуюча компанія дає notFound.
import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decryptSecret } from "@forteq/db";
import { ApiKeysService } from "../src/services/api-keys.service";
import type { AuthCtx } from "../src/di/types";
import type { ApiKeysRepo, CompaniesRepo, NewApiKey } from "../src/repositories/interfaces";

const MASTER_KEY = randomBytes(32);
const CTX: AuthCtx = { accountId: "acc-1", userId: "u-1", role: "owner" };
const COMPANY = "company-1";

// Фейк-репо, що записує (companyId, provider) кожного виклику — так тест бачить, що скоуп доходить.
class FakeApiKeysRepo implements ApiKeysRepo {
  calls: Array<{ op: string; companyId: string; provider?: string; data?: NewApiKey }> = [];
  async list(_a: string, companyId: string) {
    this.calls.push({ op: "list", companyId });
    return [];
  }
  async upsert(_a: string, companyId: string, data: NewApiKey): Promise<void> {
    this.calls.push({ op: "upsert", companyId, provider: data.provider, data });
  }
  async delete(_a: string, companyId: string, provider: string): Promise<boolean> {
    this.calls.push({ op: "delete", companyId, provider });
    return true;
  }
  async exists(): Promise<boolean> {
    return false;
  }
}

// findById повертає компанію лише для COMPANY поточного акаунта — інакше null (assertCompany → 404).
const fakeCompanies = {
  findById: async (accountId: string, id: string) =>
    accountId === CTX.accountId && id === COMPANY ? { id, name: "Acme" } : null,
} as unknown as CompaniesRepo;

function makeService(repo: ApiKeysRepo) {
  return new ApiKeysService(repo, fakeCompanies, MASTER_KEY);
}

describe("ApiKeysService — company-scoped", () => {
  it("list передає companyId у repo", async () => {
    const repo = new FakeApiKeysRepo();
    await makeService(repo).list(CTX, COMPANY);
    expect(repo.calls).toEqual([{ op: "list", companyId: COMPANY }]);
  });

  it("set шифрує ключ і upsert'ить під companyId (repo бачить лише шифротекст)", async () => {
    const repo = new FakeApiKeysRepo();
    await makeService(repo).set(CTX, COMPANY, "openai", "sk-super-secret-key-1234", "prod");
    const call = repo.calls.find((c) => c.op === "upsert")!;
    expect(call.companyId).toBe(COMPANY);
    expect(call.data!.ciphertext).not.toContain("sk-super-secret-key");
    expect(decryptSecret(call.data!.ciphertext, MASTER_KEY)).toBe("sk-super-secret-key-1234");
  });

  it("remove передає (companyId, provider) у repo", async () => {
    const repo = new FakeApiKeysRepo();
    await makeService(repo).remove(CTX, COMPANY, "anthropic");
    expect(repo.calls).toEqual([{ op: "delete", companyId: COMPANY, provider: "anthropic" }]);
  });

  it("чужа/неіснуюча компанія → notFound (repo не чіпається)", async () => {
    const repo = new FakeApiKeysRepo();
    await expect(makeService(repo).list(CTX, "other-company")).rejects.toThrow();
    expect(repo.calls).toEqual([]);
  });
});
