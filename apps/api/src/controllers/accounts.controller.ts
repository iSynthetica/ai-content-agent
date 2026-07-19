import type { Request, Response } from "express";
import { z } from "zod";
import type { Composition } from "../composition";
import { asyncHandler } from "../http/async-handler";
import { requireAuth } from "../http/middlewares/auth";

const accountIdParam = z.string().uuid();

// GET /v1/accounts + GET /v1/accounts/:accountId/companies — джерело switcher-ів shell (§B3).
// Тонкий контролер: requireAuth → openScope (SET LOCAL app.current_*) → сервіс. Форма межі — { items }.
export function accountsController(root: Composition) {
  return {
    list: asyncHandler(async (req: Request, res: Response) => {
      const auth = requireAuth(req);
      const items = await root.openScope(auth, (s) => s.services.accounts.list(auth));
      res.status(200).json({ items });
    }),

    companies: asyncHandler(async (req: Request, res: Response) => {
      const auth = requireAuth(req);
      const accountId = accountIdParam.parse(req.params.accountId);
      const items = await root.openScope(auth, (s) =>
        s.services.accounts.listCompanies(auth, accountId),
      );
      res.status(200).json({ items });
    }),
  };
}
