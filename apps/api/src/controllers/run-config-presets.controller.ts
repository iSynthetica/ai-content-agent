import type { Request, Response } from "express";
import { z } from "zod";
import { createRunPresetRequest } from "@forteq/shared";
import type { Composition } from "../composition";
import { asyncHandler } from "../http/async-handler";
import { requireAuth } from "../http/middlewares/auth";

const companyIdParam = z.string().uuid();
const idParam = z.string().uuid();

// Run-config пресети (§Phase 5): list/create per-company + delete by id. Тонкі контролери —
// логіка у RunConfigPresetsService; кожен відкриває власний request-scope (RLS).
export function runConfigPresetsController(root: Composition) {
  return {
    list: asyncHandler(async (req: Request, res: Response) => {
      const auth = requireAuth(req);
      const companyId = companyIdParam.parse(req.params.companyId);
      const result = await root.openScope(auth, (s) =>
        s.services.runConfigPresets.list(auth, companyId),
      );
      res.status(200).json(result);
    }),

    create: asyncHandler(async (req: Request, res: Response) => {
      const auth = requireAuth(req);
      const companyId = companyIdParam.parse(req.params.companyId);
      const body = createRunPresetRequest.parse(req.body);
      const preset = await root.openScope(auth, (s) =>
        s.services.runConfigPresets.create(auth, companyId, body),
      );
      res.status(201).json(preset);
    }),

    remove: asyncHandler(async (req: Request, res: Response) => {
      const auth = requireAuth(req);
      const id = idParam.parse(req.params.id);
      await root.openScope(auth, (s) => s.services.runConfigPresets.remove(auth, id));
      res.status(204).end();
    }),
  };
}
