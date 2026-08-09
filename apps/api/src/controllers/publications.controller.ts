import type { Request, Response } from "express";
import { z } from "zod";
import { publishRequest } from "@forteq/shared";
import type { Composition } from "../composition";
import { asyncHandler } from "../http/async-handler";
import { requireAuth } from "../http/middlewares/auth";

const runIdParam = z.string().uuid();

// Публікація схвалених постів прогону (§publishing §3). publish — publish:manage (роут); list —
// read (будь-який член, RLS ізолює). Тверда межа: api лише ставить job; постить worker.
export function publicationsController(root: Composition) {
  return {
    publish: asyncHandler(async (req: Request, res: Response) => {
      const auth = requireAuth(req);
      const runId = runIdParam.parse(req.params.id);
      const body = publishRequest.parse(req.body);
      const result = await root.openScope(auth, (s) =>
        s.services.publications.publish(auth, runId, body.itemIds),
      );
      // 202 — прийнято в чергу; фінальний стан (published/failed) допише worker.
      res.status(202).json(result);
    }),

    list: asyncHandler(async (req: Request, res: Response) => {
      const auth = requireAuth(req);
      const runId = runIdParam.parse(req.params.id);
      const result = await root.openScope(auth, (s) =>
        s.services.publications.listPublications(auth, runId),
      );
      res.status(200).json(result);
    }),
  };
}
