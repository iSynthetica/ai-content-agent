// Unit — ConnectionsService BYO-app, company-scoped (§per-company-settings). Ламається мовчки: якщо
// секрет застосунку осяде у БД як plaintext, або per-company `configured`/`appConfigured` перестане
// відображати реально збережені креди, UI показав би не той стан, а секрет протік би. Тому перевіряємо
// шифрування на запис (repo бачить лише шифротекст) і резолвінг кред (креди компанії → null; env-fallback
// ПРИБРАНО за директивою власника) з фейк-репо. companyId звіряється проти фейкового CompaniesRepo.
import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decryptSecret } from "@forteq/db";
import { ConnectionsService } from "../src/services/connections.service";
import type { AppConfig } from "../src/config/env";
import type { AuthCtx } from "../src/di/types";
import type {
  CompaniesRepo,
  NewServiceConnection,
  ServiceConnectionAppCreds,
  ServiceConnectionMasked,
  ServiceConnectionsRepo,
} from "../src/repositories/interfaces";

const MASTER_KEY = randomBytes(32);
const CTX: AuthCtx = { accountId: "acc-1", userId: "u-1", role: "owner" };
const COMPANY = "company-1";

// Фейк-репо: тримає рядки у Map по provider (у межах однієї компанії — цього досить для юнітів).
// Дзеркалить реальні контракти (getAppCredentials віддає ct; список — масковану форму).
class FakeRepo implements ServiceConnectionsRepo {
  rows = new Map<string, { appClientId: string | null; appClientSecretCt: string | null; status: string }>();

  async list(): Promise<ServiceConnectionMasked[]> {
    return [...this.rows.entries()].map(([provider, r]) => ({
      provider,
      status: r.status,
      externalAccountId: null,
      externalAccountName: null,
      scopes: [],
      expiresAt: null,
      lastUsedAt: null,
      createdAt: new Date().toISOString(),
      appConfigured: Boolean(r.appClientId && r.appClientSecretCt),
      appClientId: r.appClientId,
    }));
  }
  async upsert(_a: string, _c: string, _d: NewServiceConnection): Promise<void> {}
  async delete(): Promise<boolean> {
    return true;
  }
  async existsByProvider(): Promise<boolean> {
    return false;
  }
  async getAppCredentials(
    _a: string,
    _c: string,
    provider: string,
  ): Promise<ServiceConnectionAppCreds | null> {
    const r = this.rows.get(provider);
    return r ? { appClientId: r.appClientId, appClientSecretCt: r.appClientSecretCt } : null;
  }
  async setAppCredentials(
    _a: string,
    _c: string,
    provider: string,
    clientId: string,
    clientSecretCt: string,
  ): Promise<void> {
    this.rows.set(provider, { appClientId: clientId, appClientSecretCt: clientSecretCt, status: "disconnected" });
  }
}

// Фейк CompaniesRepo — assertCompany викликає лише findById; повертаємо непорожню компанію.
const fakeCompanies = {
  findById: async (_accountId: string, id: string) => ({ id, name: "Acme" }),
} as unknown as CompaniesRepo;

function makeService(repo: ServiceConnectionsRepo, envOverrides: Partial<AppConfig> = {}) {
  const config = { NODE_ENV: "test", ...envOverrides } as unknown as AppConfig;
  return new ConnectionsService(repo, fakeCompanies, MASTER_KEY, config);
}

describe("ConnectionsService — BYO-app credentials (company-scoped)", () => {
  it("setAppCredentials шифрує секрет на запис (repo бачить лише шифротекст)", async () => {
    const repo = new FakeRepo();
    const svc = makeService(repo);
    await svc.setAppCredentials(CTX, COMPANY, "linkedin", { clientId: "li-id", clientSecret: "li-secret" });

    const stored = repo.rows.get("linkedin")!;
    expect(stored.appClientId).toBe("li-id");
    // Секрет НЕ лежить plaintext'ом — це шифротекст, який декриптиться назад майстер-ключем.
    expect(stored.appClientSecretCt).not.toBe("li-secret");
    expect(decryptSecret(stored.appClientSecretCt!, MASTER_KEY)).toBe("li-secret");
  });

  it("setAppCredentials відхиляє telegram (не OAuth-застосунок)", async () => {
    const svc = makeService(new FakeRepo());
    await expect(
      svc.setAppCredentials(CTX, COMPANY, "telegram", { clientId: "x", clientSecret: "y" }),
    ).rejects.toThrow();
  });

  it("resolveCreds: креди КОМПАНІЇ (розшифрований секрет)", async () => {
    const repo = new FakeRepo();
    // Навіть за наявних env-кред резолвимо ВИКЛЮЧНО креди компанії (env-fallback прибрано).
    const svc = makeService(repo, { LINKEDIN_CLIENT_ID: "env-id", LINKEDIN_CLIENT_SECRET: "env-sec" } as Partial<AppConfig>);
    await svc.setAppCredentials(CTX, COMPANY, "linkedin", { clientId: "tenant-id", clientSecret: "tenant-sec" });

    const creds = await svc.resolveCreds(CTX, COMPANY, "linkedin");
    expect(creds).toEqual({ clientId: "tenant-id", clientSecret: "tenant-sec" });
  });

  it("resolveCreds: null, коли компанія не ввела кред (env НЕ рятує — fallback прибрано)", async () => {
    const svc = makeService(new FakeRepo(), {
      X_CLIENT_ID: "env-x-id",
      X_CLIENT_SECRET: "env-x-sec",
    } as Partial<AppConfig>);
    expect(await svc.resolveCreds(CTX, COMPANY, "twitter")).toBeNull();
  });

  it("list: per-company configured/appConfigured відображають лише реально збережені креди компанії", async () => {
    const repo = new FakeRepo();
    // Наявність env-кред IG НЕ робить його configured — лише реальні креди компанії (linkedin).
    const svc = makeService(repo, { IG_CLIENT_ID: "ig", IG_CLIENT_SECRET: "igs" } as Partial<AppConfig>);
    await svc.setAppCredentials(CTX, COMPANY, "linkedin", { clientId: "li-id", clientSecret: "li-secret" });

    const res = await svc.list(CTX, COMPANY);
    // linkedin — креди компанії → configured; telegram — завжди.
    expect(res.configured).toContain("linkedin");
    expect(res.configured).toContain("telegram");
    // instagram (лише env) та twitter (нічого) → НЕ configured (env-fallback прибрано).
    expect(res.configured).not.toContain("instagram");
    expect(res.configured).not.toContain("twitter");

    const li = res.items.find((c) => c.provider === "linkedin")!;
    expect(li.appConfigured).toBe(true);
    expect(li.appClientId).toBe("li-id"); // client id віддаємо (не секрет)
  });

  it("startAuthorize: без кред — 422 (спершу введіть ключі застосунку)", async () => {
    const svc = makeService(new FakeRepo());
    await expect(svc.startAuthorize(CTX, COMPANY, "twitter")).rejects.toThrow(/ключі застосунку/);
  });
});
