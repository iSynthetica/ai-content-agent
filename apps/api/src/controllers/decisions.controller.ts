import type { Request, Response } from "express";
import { z } from "zod";
import { decisionRequest } from "@forteq/shared";
import type { Composition } from "../composition";
import { asyncHandler } from "../http/async-handler";
import { requireAuth } from "../http/middlewares/auth";

const idParam = z.string().uuid();

// HITL decision-контролери (§7, api-contract). Єдиний ендпоінт рішення на кожному рівні (тіло
// `decisionRequest` — approve|reject|rerun + feedback?). Тверда межа: api граф НЕ ганяє —
// approve/reject по айтему пишуть лише БД, усі resume-шляхи — enqueue у after-commit-хук (§2.7.2).
export function decisionsController(root: Composition) {
  return {
    // POST /v1/runs/:id/decision — рішення по прогону. enqueue `generation.resume` + status→running.
    // 202 { runId, status:'running' } (namір передано у чергу; фінальний статус виставить worker).
    run: asyncHandler(async (req: Request, res: Response) => {
      const auth = requireAuth(req);
      const id = idParam.parse(req.params.id);
      const body = decisionRequest.parse(req.body);
      const result = await root.openScope(auth, (s) => s.services.runs.decideRun(auth, id, body));
      res.status(202).json(result);
    }),

    // POST /v1/content-items/:id/decision — per-item рішення. approve/reject → прямий статус (200);
    // rerun → resume наявного прогону для цього айтема. Відповідь — оновлений `contentItemDTO`.
    item: asyncHandler(async (req: Request, res: Response) => {
      const auth = requireAuth(req);
      const id = idParam.parse(req.params.id);
      const body = decisionRequest.parse(req.body);
      const updated = await root.openScope(auth, (s) =>
        s.services.contentItems.decideItem(auth, id, body),
      );
      res.status(200).json(updated);
    }),
  };
}
