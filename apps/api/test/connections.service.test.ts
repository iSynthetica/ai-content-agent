// Unit — ConnectionsService BYO-app (§byo-oauth-app-creds). Ламається мовчки: якщо секрет застосунку
// осяде у БД як plaintext, або per-tenant `configured`/`appConfigured` перестане відображати реально
// збережені креди, UI показав би не той стан, а секрет протік би. Тому перевіряємо саме шифрування на
// запис (repo бачить лише шифротекст) і резолвінг кред (орендар → env-fallback → null) з фейк-репо.
import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decryptSecret } from "@forteq/db";
import { ConnectionsService } from "../src/services/connections.service";
import type { AppConfig } from "../src/config/env";
import type { AuthCtx } from "../src/di/types";
import type {
  NewServiceConnection,
  ServiceConnectionAppCreds,
  ServiceConnectionMasked,
  ServiceConnectionsRepo,
} from "../src/repositories/interfaces";

const MASTER_KEY = randomBytes(32);
const CTX: AuthCtx = { accountId: "acc-1", userId: "u-1", role: "owner" };

// Фейк-репо: тримає рядки у Map по provider. Дзеркалить реальні контракти (getAppCredentials віддає
// ct; список — масковану форму з appConfigured/appClientId).
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
  async upsert(_a: string, _d: NewServiceConnection): Promise<void> {}
  async delete(): Promise<boolean> {
    return true;
  }
  async existsByProvider(): Promise<boolean> {
    return false;
  }
  async getAppCredentials(_a: string, provider: string): Promise<ServiceConnectionAppCreds | null> {
    const r = this.rows.get(provider);
    return r ? { appClientId: r.appClientId, appClientSecretCt: r.appClientSecretCt } : null;
  }
  async setAppCredentials(_a: string, provider: string, clientId: string, clientSecretCt: string): Promise<void> {
    this.rows.set(provider, { appClientId: clientId, appClientSecretCt: clientSecretCt, status: "disconnected" });
  }
}

function makeService(repo: ServiceConnectionsRepo, envOverrides: Partial<AppConfig> = {}) {
  const config = { NODE_ENV: "test", ...envOverrides } as unknown as AppConfig;
  return new ConnectionsService(repo, MASTER_KEY, config);
}

describe("ConnectionsService — BYO-app credentials", () => {
  it("setAppCredentials шифрує секрет на запис (repo бачить лише шифротекст)", async () => {
    const repo = new FakeRepo();
    const svc = makeService(repo);
    await svc.setAppCredentials(CTX, "linkedin", { clientId: "li-id", clientSecret: "li-secret" });

    const stored = repo.rows.get("linkedin")!;
    expect(stored.appClientId).toBe("li-id");
    // Секрет НЕ лежить plaintext'ом — це шифротекст, який декриптиться назад майстер-ключем.
    expect(stored.appClientSecretCt).not.toBe("li-secret");
    expect(decryptSecret(stored.appClientSecretCt!, MASTER_KEY)).toBe("li-secret");
  });

  it("setAppCredentials відхиляє telegram (не OAuth-застосунок)", async () => {
    const svc = makeService(new FakeRepo());
    await expect(svc.setAppCredentials(CTX, "telegram", { clientId: "x", clientSecret: "y" })).rejects.toThrow();
  });

  it("resolveCreds: креди орендаря у пріоритеті (розшифрований секрет)", async () => {
    const repo = new FakeRepo();
    const svc = makeService(repo, { LINKEDIN_CLIENT_ID: "env-id", LINKEDIN_CLIENT_SECRET: "env-sec" } as Partial<AppConfig>);
    await svc.setAppCredentials(CTX, "linkedin", { clientId: "tenant-id", clientSecret: "tenant-sec" });

    const creds = await svc.resolveCreds(CTX, "linkedin");
    expect(creds).toEqual({ clientId: "tenant-id", clientSecret: "tenant-sec" });
  });

  it("resolveCreds: падає на env-креди, коли орендар не ввів свої", async () => {
    const svc = makeService(new FakeRepo(), {
      X_CLIENT_ID: "env-x-id",
      X_CLIENT_SECRET: "env-x-sec",
    } as Partial<AppConfig>);
    const creds = await svc.resolveCreds(CTX, "twitter");
    expect(creds).toEqual({ clientId: "env-x-id", clientSecret: "env-x-sec" });
  });

  it("resolveCreds: null, коли нема ані кред орендаря, ані env", async () => {
    const svc = makeService(new FakeRepo());
    expect(await svc.resolveCreds(CTX, "instagram")).toBeNull();
  });

  it("list: per-tenant configured + appConfigured відображають реально збережені креди", async () => {
    const repo = new FakeRepo();
    // instagram має env-fallback; linkedin отримає креди орендаря; twitter — жодних.
    const svc = makeService(repo, { IG_CLIENT_ID: "ig", IG_CLIENT_SECRET: "igs" } as Partial<AppConfig>);
    await svc.setAppCredentials(CTX, "linkedin", { clientId: "li-id", clientSecret: "li-secret" });

    const res = await svc.list(CTX);
    // linkedin — креди орендаря → configured; instagram — env-fallback → configured; telegram — завжди.
    expect(res.configured).toContain("linkedin");
    expect(res.configured).toContain("instagram");
    expect(res.configured).toContain("telegram");
    // twitter — ані орендаря, ані env → НЕ configured.
    expect(res.configured).not.toContain("twitter");

    const li = res.items.find((c) => c.provider === "linkedin")!;
    expect(li.appConfigured).toBe(true);
    expect(li.appClientId).toBe("li-id"); // client id віддаємо (не секрет)
  });

  it("startAuthorize: без кред — 422 (спершу введіть ключі застосунку)", async () => {
    const svc = makeService(new FakeRepo());
    await expect(svc.startAuthorize(CTX, "twitter")).rejects.toThrow(/ключі застосунку/);
  });
});
