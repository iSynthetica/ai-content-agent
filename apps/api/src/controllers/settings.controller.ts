import type { Request, Response } from "express";
import { z } from "zod";
import { updateSettingsRequest } from "@forteq/shared";
import type { Composition } from "../composition";
import { asyncHandler } from "../http/async-handler";
import { requireAuth } from "../http/middlewares/auth";

const companyIdParam = z.string().uuid();

// GET/PUT /v1/companies/:companyId/settings — бренд + дефолти генерації (§B8).
export function settingsController(root: Composition) {
  return {
    get: asyncHandler(async (req: Request, res: Response) => {
      const auth = requireAuth(req);
      const companyId = companyIdParam.parse(req.params.companyId);
      const settings = await root.openScope(auth, (s) => s.services.settings.get(auth, companyId));
      res.status(200).json(settings);
    }),

    put: asyncHandler(async (req: Request, res: Response) => {
      const auth = requireAuth(req);
      const companyId = companyIdParam.parse(req.params.companyId);
      const patch = updateSettingsRequest.parse(req.body);
      const settings = await root.openScope(auth, (s) =>
        s.services.settings.upsert(auth, companyId, patch),
      );
      res.status(200).json(settings);
    }),
  };
}
