// Unit — MembersService (§RBAC member-mgmt F2). Fake-репо + fake better-auth: перевіряємо
// провіженінг (invite-provisions-user) і найдорожчий клас — ІНВАРІАНТИ (останній owner, не-себе),
// бо тихий їх обхід = або локаут акаунта, або підвищення прав.
import { describe, expect, it, vi } from "vitest";
import { MembersService } from "../src/services/members.service";
import { AppError } from "../src/http/errors";
import type { AuthCtx } from "../src/di/types";
import type { Auth } from "../src/auth/better-auth";
import type { MemberRow, MembersRepo } from "../src/repositories/interfaces";

const ACCOUNT = "11111111-1111-1111-1111-111111111111";
const OWNER = "22222222-2222-2222-2222-222222222222";
const ctx: AuthCtx = { accountId: ACCOUNT, userId: OWNER, role: "owner" };

// Fake-репо: users за email, memberships за (account,userId).
class FakeMembers implements MembersRepo {
  users = new Map<string, { userId: string; name: string | null; createdAt: string }>(); // email → user
  members: MemberRow[] = [];
  private seq = 0;

  seed(email: string, userId: string, role: string) {
    this.users.set(email, { userId, name: null, createdAt: "2026-01-01T00:00:00.000Z" });
    this.members.push({ userId, email, name: null, role, createdAt: "2026-01-01T00:00:00.000Z" });
  }
  async listByAccount(): Promise<MemberRow[]> {
    return this.members;
  }
  async findUserByEmail(email: string) {
    const u = this.users.get(email);
    return u ? { userId: u.userId, name: u.name } : null;
  }
  async insertUser(email: string, name: string | null) {
    const userId = `u${++this.seq}`;
    const createdAt = "2026-02-02T00:00:00.000Z";
    this.users.set(email, { userId, name, createdAt });
    return { userId, createdAt };
  }
  async insertMembership(_a: string, userId: string, role: string) {
    const u = [...this.users.values()].find((x) => x.userId === userId)!;
    const email = [...this.users.entries()].find(([, x]) => x.userId === userId)![0];
    this.members.push({ userId, email, name: u.name, role, createdAt: u.createdAt });
  }
  async updateRole(_a: string, userId: string, role: string) {
    const m = this.members.find((x) => x.userId === userId);
    if (!m) return false;
    m.role = role;
    return true;
  }
  async deleteMembership(_a: string, userId: string) {
    const before = this.members.length;
    this.members = this.members.filter((x) => x.userId !== userId);
    return this.members.length < before;
  }
  async countOwners() {
    return this.members.filter((x) => x.role === "owner").length;
  }
  async memberRow(_a: string, userId: string) {
    return this.members.find((x) => x.userId === userId) ?? null;
  }
}

function makeAuth(signUp = vi.fn().mockResolvedValue({})): Auth {
  return { api: { signUpEmail: signUp } } as unknown as Auth;
}
const logger = { warn: vi.fn(), info: vi.fn(), error: vi.fn() } as never;

function svc(repo: FakeMembers, auth = makeAuth()) {
  return new MembersService(repo, auth, logger);
}

describe("MembersService", () => {
  it("add НОВОГО email провіженить ba_user + повертає tempPassword", async () => {
    const repo = new FakeMembers();
    repo.seed("owner@x.com", OWNER, "owner");
    const auth = makeAuth();
    const res = await svc(repo, auth).add(ctx, { email: "bob@x.com", role: "editor" });
    expect(auth.api.signUpEmail).toHaveBeenCalledOnce();
    expect(res.tempPassword).toBeTruthy();
    expect(res.member.email).toBe("bob@x.com");
    expect(res.member.role).toBe("editor");
  });

  it("add уже-зареєстрованого (без членства) НЕ провіженить, tempPassword=null", async () => {
    const repo = new FakeMembers();
    repo.seed("owner@x.com", OWNER, "owner");
    repo.users.set("carol@x.com", { userId: "u-carol", name: null, createdAt: "2026-01-01T00:00:00.000Z" });
    const auth = makeAuth();
    const res = await svc(repo, auth).add(ctx, { email: "carol@x.com", role: "reviewer" });
    expect(auth.api.signUpEmail).not.toHaveBeenCalled();
    expect(res.tempPassword).toBeNull();
    expect(res.member.role).toBe("reviewer");
  });

  it("add уже-члена → 409", async () => {
    const repo = new FakeMembers();
    repo.seed("owner@x.com", OWNER, "owner");
    repo.seed("bob@x.com", "u-bob", "editor");
    await expect(svc(repo).add(ctx, { email: "bob@x.com", role: "viewer" })).rejects.toMatchObject({
      status: 409,
    });
  });

  it("changeRole самому собі → 422", async () => {
    const repo = new FakeMembers();
    repo.seed("owner@x.com", OWNER, "owner");
    await expect(svc(repo).changeRole(ctx, OWNER, "editor")).rejects.toMatchObject({ status: 422 });
  });

  it("changeRole: зниження ОСТАННЬОГО owner → 422", async () => {
    const repo = new FakeMembers();
    repo.seed("owner@x.com", OWNER, "owner");
    repo.seed("bob@x.com", "u-bob", "owner"); // тепер два owner
    // знизити bob (не останній) — ок
    await expect(svc(repo).changeRole(ctx, "u-bob", "editor")).resolves.toMatchObject({ role: "editor" });
    // тепер owner лишився один (OWNER) — знизити його не можна, але це self → однаково 422
    // перевіримо на не-self сценарії: додамо ще одного owner і зробимо його єдиним
    const repo2 = new FakeMembers();
    repo2.seed("owner@x.com", OWNER, "owner");
    repo2.seed("dave@x.com", "u-dave", "owner");
    // видалимо OWNER-контекст як не-останнього — лишиться u-dave єдиним owner
    // спробуємо знизити u-dave, коли він єдиний owner (спочатку знизимо через видалення іншого)
    repo2.members = repo2.members.filter((m) => m.userId !== OWNER); // лишився лише u-dave owner
    const ctxDave: AuthCtx = { accountId: ACCOUNT, userId: OWNER, role: "owner" };
    await expect(svc(repo2).changeRole(ctxDave, "u-dave", "editor")).rejects.toMatchObject({ status: 422 });
  });

  it("remove самого себе → 422", async () => {
    const repo = new FakeMembers();
    repo.seed("owner@x.com", OWNER, "owner");
    await expect(svc(repo).remove(ctx, OWNER)).rejects.toMatchObject({ status: 422 });
  });

  it("remove ОСТАННЬОГО owner → 422", async () => {
    const repo = new FakeMembers();
    repo.seed("owner@x.com", OWNER, "owner");
    repo.seed("dave@x.com", "u-dave", "owner");
    repo.members = repo.members.filter((m) => m.userId !== OWNER); // u-dave — єдиний owner
    await expect(svc(repo).remove(ctx, "u-dave")).rejects.toMatchObject({ status: 422 });
  });

  it("remove звичайного члена → ок", async () => {
    const repo = new FakeMembers();
    repo.seed("owner@x.com", OWNER, "owner");
    repo.seed("bob@x.com", "u-bob", "editor");
    await expect(svc(repo).remove(ctx, "u-bob")).resolves.toBeUndefined();
    expect(await repo.memberRow(ACCOUNT, "u-bob")).toBeNull();
  });

  it("changeRole/remove неіснуючого члена → 404", async () => {
    const repo = new FakeMembers();
    repo.seed("owner@x.com", OWNER, "owner");
    repo.seed("bob@x.com", "u-bob", "editor"); // щоб OWNER не був останнім у changeRole-гілці
    await expect(svc(repo).changeRole(ctx, "nope", "viewer")).rejects.toBeInstanceOf(AppError);
    await expect(svc(repo).remove(ctx, "nope")).rejects.toMatchObject({ status: 404 });
  });
});
