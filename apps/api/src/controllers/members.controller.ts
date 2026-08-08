import type { Request, Response } from "express";
import { z } from "zod";
import { addMemberRequest, changeMemberRoleRequest } from "@forteq/shared";
import type { Composition } from "../composition";
import { asyncHandler } from "../http/async-handler";
import { requireAuth } from "../http/middlewares/auth";
import { AppError } from "../http/errors";

const accountIdParam = z.string().uuid();
const userIdParam = z.string().uuid();

// Керування членами акаунта (§RBAC member-mgmt F2). Усі роути за requirePermission("member:manage").
// Модель одного акаунта на юзера: шлях несе :accountId, але керувати можна ЛИШЕ власним акаунтом —
// розбіжність із ctx.accountId → 403 (поверх RLS, який і так ізолює).
export function membersController(root: Composition) {
  function assertOwnAccount(req: Request): string {
    const auth = requireAuth(req);
    const accountId = accountIdParam.parse(req.params.accountId);
    if (accountId !== auth.accountId) throw AppError.forbidden("account");
    return accountId;
  }

  return {
    list: asyncHandler(async (req: Request, res: Response) => {
      const auth = requireAuth(req);
      assertOwnAccount(req);
      const result = await root.openScope(auth, (s) => s.services.members.list(auth));
      res.status(200).json(result);
    }),

    add: asyncHandler(async (req: Request, res: Response) => {
      const auth = requireAuth(req);
      assertOwnAccount(req);
      const body = addMemberRequest.parse(req.body);
      const result = await root.openScope(auth, (s) => s.services.members.add(auth, body));
      res.status(201).json(result);
    }),

    changeRole: asyncHandler(async (req: Request, res: Response) => {
      const auth = requireAuth(req);
      assertOwnAccount(req);
      const userId = userIdParam.parse(req.params.userId);
      const body = changeMemberRoleRequest.parse(req.body);
      const member = await root.openScope(auth, (s) =>
        s.services.members.changeRole(auth, userId, body.role),
      );
      res.status(200).json(member);
    }),

    remove: asyncHandler(async (req: Request, res: Response) => {
      const auth = requireAuth(req);
      assertOwnAccount(req);
      const userId = userIdParam.parse(req.params.userId);
      await root.openScope(auth, (s) => s.services.members.remove(auth, userId));
      res.status(204).end();
    }),
  };
}
