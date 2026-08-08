// RBAC: матриця дозволів (@forteq/shared) + route-гвард requirePermission.
//
// Навіщо тест саме тут: enforcement живе в api, а розходження ролі й дозволу мовчить — типи не
// бачать, що viewer дістав до approve. Найдорожчий клас помилки RBAC — не 500, а тихий доступ:
// зелений happy-path нічого не каже про те, що заборонене справді заборонене. Тому перевіряємо
// обидві гілки кожного гварда — і дозвіл, і відмову.
import type { Request } from "express";
import { describe, expect, it, vi } from "vitest";
import { type Permission, type Role, PERMISSIONS, ROLES, can } from "@forteq/shared";
import { requirePermission } from "../src/http/middlewares/require-permission";
import { AppError } from "../src/http/errors";

// Очікувана матриця, продубльована НЕЗАЛЕЖНО від коду: якщо хтось розширить права ролі в
// permissions.ts, цей тест має впасти, а не підлаштуватись. Дублювання тут — фіча, не борг.
const EXPECTED: Record<Role, Permission[]> = {
  owner: [
    "company:write",
    "company:delete",
    "settings:write",
    "plan:write",
    "run:start",
    "decision:make",
    "apikey:manage",
    "member:manage",
    "content:edit",
  ],
  admin: [
    "company:write",
    "company:delete",
    "settings:write",
    "plan:write",
    "run:start",
    "decision:make",
    "apikey:manage",
    "member:manage",
    "content:edit",
  ],
  editor: [
    "company:write",
    "settings:write",
    "plan:write",
    "run:start",
    "decision:make",
    "content:edit",
  ],
  reviewer: ["decision:make"],
  viewer: [],
};

describe("RBAC matrix (can)", () => {
  for (const role of ROLES) {
    for (const permission of PERMISSIONS) {
      const allowed = EXPECTED[role].includes(permission);
      it(`${role} ${allowed ? "may" : "may NOT"} ${permission}`, () => {
        expect(can(role, permission)).toBe(allowed);
      });
    }
  }

  it("viewer has no write permissions at all", () => {
    for (const permission of PERMISSIONS) expect(can("viewer", permission)).toBe(false);
  });

  it("reviewer may only make decisions", () => {
    for (const permission of PERMISSIONS) {
      expect(can("reviewer", permission)).toBe(permission === "decision:make");
    }
  });

  it("editor may not manage API keys, delete companies, or manage members", () => {
    expect(can("editor", "apikey:manage")).toBe(false);
    expect(can("editor", "company:delete")).toBe(false);
    expect(can("editor", "member:manage")).toBe(false);
  });

  it("only owner/admin may manage members (activates the rest of RBAC)", () => {
    expect(can("owner", "member:manage")).toBe(true);
    expect(can("admin", "member:manage")).toBe(true);
    for (const role of ["editor", "reviewer", "viewer"] as const) {
      expect(can(role, "member:manage")).toBe(false);
    }
  });

  it("reviewer may decide but not edit post content directly", () => {
    expect(can("reviewer", "decision:make")).toBe(true);
    expect(can("reviewer", "content:edit")).toBe(false);
  });

  it("editor and above may edit post content", () => {
    expect(can("owner", "content:edit")).toBe(true);
    expect(can("admin", "content:edit")).toBe(true);
    expect(can("editor", "content:edit")).toBe(true);
  });
});

// Мінімальний req із роллю — гвард читає лише req.auth.role.
function reqAs(role: Role): Request {
  return { auth: { accountId: "a", userId: "u", role } } as unknown as Request;
}

describe("requirePermission guard", () => {
  it("calls next() with no argument when the role is allowed", () => {
    const next = vi.fn();
    requirePermission("run:start")(reqAs("editor"), {} as never, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith();
  });

  it("passes a 403 AppError to next() when the role is denied", () => {
    const next = vi.fn();
    requirePermission("apikey:manage")(reqAs("editor"), {} as never, next);
    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0]![0] as AppError;
    expect(err).toBeInstanceOf(AppError);
    expect(err.status).toBe(403);
    expect(err.code).toBe("forbidden");
  });

  it("denies a viewer the decision endpoint", () => {
    const next = vi.fn();
    requirePermission("decision:make")(reqAs("viewer"), {} as never, next);
    const err = next.mock.calls[0]![0] as AppError;
    expect(err.status).toBe(403);
  });

  it("allows a reviewer to make a decision but not to start a run", () => {
    const ok = vi.fn();
    requirePermission("decision:make")(reqAs("reviewer"), {} as never, ok);
    expect(ok).toHaveBeenCalledWith();

    const denied = vi.fn();
    requirePermission("run:start")(reqAs("reviewer"), {} as never, denied);
    expect((denied.mock.calls[0]![0] as AppError).status).toBe(403);
  });

  it("gates content:edit — editor passes, reviewer is denied", () => {
    const ok = vi.fn();
    requirePermission("content:edit")(reqAs("editor"), {} as never, ok);
    expect(ok).toHaveBeenCalledWith();

    const denied = vi.fn();
    requirePermission("content:edit")(reqAs("reviewer"), {} as never, denied);
    expect((denied.mock.calls[0]![0] as AppError).status).toBe(403);
  });
});
