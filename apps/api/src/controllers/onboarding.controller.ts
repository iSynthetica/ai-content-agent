import type { Request, Response } from "express";
import { z } from "zod";
import { onboardingRequest } from "@forteq/shared";
import type { Composition } from "../composition";
import { asyncHandler } from "../http/async-handler";
import { requireAuth } from "../http/middlewares/auth";

const companyIdParam = z.string().uuid();

// Онбординг (§2.12): POST /v1/onboarding (створення) + POST/GET /v1/companies/:id/bootstrap
// (enrichment-тригер/статус). bootstrap делегує у CompaniesService (§4.1).
export function onboardingController(root: Composition) {
  return {
    onboard: asyncHandler(async (req: Request, res: Response) => {
      const auth = requireAuth(req);
      const body = onboardingRequest.parse(req.body);
      const result = await root.openScope(auth, (s) => s.services.onboarding.onboard(auth, body));
      res.status(201).json(result);
    }),

    bootstrap: asyncHandler(async (req: Request, res: Response) => {
      const auth = requireAuth(req);
      const companyId = companyIdParam.parse(req.params.companyId);
      const result = await root.openScope(auth, (s) =>
        s.services.companies.bootstrap(auth, companyId),
      );
      // 202 Accepted — enrichment виконує worker; api лише enqueue-нув (тверда межа).
      res.status(202).json(result);
    }),

    bootstrapStatus: asyncHandler(async (req: Request, res: Response) => {
      const auth = requireAuth(req);
      const companyId = companyIdParam.parse(req.params.companyId);
      const result = await root.openScope(auth, (s) =>
        s.services.companies.bootstrapStatus(auth, companyId),
      );
      res.status(200).json(result);
    }),
  };
}
