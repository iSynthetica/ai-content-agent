import type { Request, Response } from "express";
import { z } from "zod";
import { approveEntriesRequest, materializeRequest, patchPlanEntryRequest } from "@forteq/shared";
import type { Composition } from "../composition";
import { asyncHandler } from "../http/async-handler";
import { requireAuth } from "../http/middlewares/auth";

const companyIdParam = z.string().uuid();
const idParam = z.string().uuid();
const listQuery = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

// Планувальник (§2.11): слоти контент-плану. Планування відокремлене від генерації —
// ці ендпоінти працюють зі слотами, а запуск прогону йде через POST /companies/:id/runs
// з planEntryIds.
export function plannerController(root: Composition) {
  return {
    list: asyncHandler(async (req: Request, res: Response) => {
      const auth = requireAuth(req);
      const companyId = companyIdParam.parse(req.params.companyId);
      const range = listQuery.parse(req.query);
      const items = await root.openScope(auth, (s) => s.services.planner.list(auth, companyId, range));
      res.status(200).json({ items });
    }),

    materialize: asyncHandler(async (req: Request, res: Response) => {
      const auth = requireAuth(req);
      const companyId = companyIdParam.parse(req.params.companyId);
      const body = materializeRequest.parse(req.body ?? {});
      // "Сьогодні" фіксується ТУТ, на межі, і передається у сервіс аргументом: доменна логіка
      // лишається чистою і відтворюваною, а не залежною від моменту виконання.
      const today = new Date().toISOString().slice(0, 10);
      const out = await root.openScope(auth, (s) =>
        s.services.planner.materialize(auth, companyId, { horizonWeeks: body.horizonWeeks, today }),
      );
      res.status(200).json(out);
    }),

    patch: asyncHandler(async (req: Request, res: Response) => {
      const auth = requireAuth(req);
      const id = idParam.parse(req.params.id);
      const patch = patchPlanEntryRequest.parse(req.body);
      const entry = await root.openScope(auth, (s) => s.services.planner.patchEntry(auth, id, patch));
      res.status(200).json(entry);
    }),

    approve: asyncHandler(async (req: Request, res: Response) => {
      const auth = requireAuth(req);
      const { ids } = approveEntriesRequest.parse(req.body);
      const out = await root.openScope(auth, (s) => s.services.planner.approve(auth, ids));
      res.status(200).json(out);
    }),
  };
}
