import type { Request, Response } from "express";
import { z } from "zod";
import { updateContentPlanRequest } from "@forteq/shared";
import type { Composition } from "../composition";
import { asyncHandler } from "../http/async-handler";
import { requireAuth } from "../http/middlewares/auth";

const companyIdParam = z.string().uuid();

// GET/PUT /v1/companies/:companyId/content-plan — гнучкий config (cadence/pillars/topicMode/…, §2.11).
export function contentPlansController(root: Composition) {
  return {
    get: asyncHandler(async (req: Request, res: Response) => {
      const auth = requireAuth(req);
      const companyId = companyIdParam.parse(req.params.companyId);
      const plan = await root.openScope(auth, (s) => s.services.contentPlans.get(auth, companyId));
      res.status(200).json(plan);
    }),

    put: asyncHandler(async (req: Request, res: Response) => {
      const auth = requireAuth(req);
      const companyId = companyIdParam.parse(req.params.companyId);
      const body = updateContentPlanRequest.parse(req.body);
      const plan = await root.openScope(auth, (s) =>
        s.services.contentPlans.upsert(auth, companyId, {
          channelCounts: body.channelCounts,
          config: body.config,
        }),
      );
      res.status(200).json(plan);
    }),
  };
}
