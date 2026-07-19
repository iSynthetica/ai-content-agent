import type { Request, Response } from "express";
import { z } from "zod";
import { updateCompanyRequest } from "@forteq/shared";
import type { Composition } from "../composition";
import { asyncHandler } from "../http/async-handler";
import { requireAuth } from "../http/middlewares/auth";

// @forteq/shared не має окремого createCompany-DTO — деривуємо з updateCompanyRequest (name обов'язковий).
const createCompanySchema = updateCompanyRequest.extend({ name: z.string().min(1) });
const pageQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
const companyIdParam = z.string().uuid();

export function companiesController(root: Composition) {
  return {
    list: asyncHandler(async (req: Request, res: Response) => {
      const auth = requireAuth(req);
      const page = pageQuery.parse(req.query);
      const result = await root.openScope(auth, (s) => s.services.companies.list(auth, page));
      res.status(200).json(result);
    }),

    create: asyncHandler(async (req: Request, res: Response) => {
      const auth = requireAuth(req);
      const body = createCompanySchema.parse(req.body);
      const company = await root.openScope(auth, (s) => s.services.companies.create(auth, body));
      res.status(201).json(company);
    }),

    get: asyncHandler(async (req: Request, res: Response) => {
      const auth = requireAuth(req);
      const id = companyIdParam.parse(req.params.companyId);
      const company = await root.openScope(auth, (s) => s.services.companies.get(auth, id));
      res.status(200).json(company);
    }),

    update: asyncHandler(async (req: Request, res: Response) => {
      const auth = requireAuth(req);
      const id = companyIdParam.parse(req.params.companyId);
      const patch = updateCompanyRequest.parse(req.body);
      const company = await root.openScope(auth, (s) => s.services.companies.update(auth, id, patch));
      res.status(200).json(company);
    }),

    remove: asyncHandler(async (req: Request, res: Response) => {
      const auth = requireAuth(req);
      const id = companyIdParam.parse(req.params.companyId);
      const result = await root.openScope(auth, (s) => s.services.companies.remove(auth, id));
      res.status(200).json(result);
    }),
  };
}
