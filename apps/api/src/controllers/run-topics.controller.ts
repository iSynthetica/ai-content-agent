import type { Request, Response } from "express";
import { z } from "zod";
import { suggestRunTopicsRequest } from "@forteq/shared";
import type { Composition } from "../composition";
import { asyncHandler } from "../http/async-handler";
import { requireAuth } from "../http/middlewares/auth";

const companyIdParam = z.string().uuid();
const draftIdParam = z.string().uuid();

// Topic preview (§runtopics): AI пропонує теми для ad-hoc прогону ще ДО генерації. suggest —
// enqueue (202, робота фонова); getDraft — поллінг стану чернетки (pending/ready/failed).
export function runTopicsController(root: Composition) {
  return {
    suggest: asyncHandler(async (req: Request, res: Response) => {
      const auth = requireAuth(req);
      const companyId = companyIdParam.parse(req.params.companyId);
      const body = suggestRunTopicsRequest.parse(req.body);
      const result = await root.openScope(auth, (s) =>
        s.services.runTopicDrafts.requestSuggestions(auth, companyId, body),
      );
      res.status(202).json(result);
    }),

    getDraft: asyncHandler(async (req: Request, res: Response) => {
      const auth = requireAuth(req);
      const companyId = companyIdParam.parse(req.params.companyId);
      const draftId = draftIdParam.parse(req.params.draftId);
      const draft = await root.openScope(auth, (s) =>
        s.services.runTopicDrafts.getDraft(auth, companyId, draftId),
      );
      res.status(200).json(draft);
    }),
  };
}
