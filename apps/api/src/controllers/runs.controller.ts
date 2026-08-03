import type { Request, Response } from "express";
import { z } from "zod";
import { createRunRequest, channelSchema, runStatusSchema } from "@forteq/shared";
import type { Composition } from "../composition";
import { asyncHandler } from "../http/async-handler";
import { requireAuth } from "../http/middlewares/auth";

const companyIdParam = z.string().uuid();
const idParam = z.string().uuid();
const listRunsQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: runStatusSchema.optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});
const itemsQuery = z.object({ channel: channelSchema.optional() });
// Дефолт md: FR-10.1 (Markdown) — MUST, JSON (FR-10.2) — SHOULD, тож без параметра віддаємо саме md.
const exportQuery = z.object({ format: z.enum(["md", "json"]).default("md") });

// Runs (§B9): POST create (→ generation_run + enqueue), GET list (календар), GET :id, GET :id/items,
// GET :id/export (вивантаження пакета MD/JSON).
// Тверда межа: api граф НЕ ганяє; enqueue — after-commit-хук (§2.7). Response POST — { runId } (201/202).
export function runsController(root: Composition) {
  return {
    create: asyncHandler(async (req: Request, res: Response) => {
      const auth = requireAuth(req);
      const companyId = companyIdParam.parse(req.params.companyId);
      const body = createRunRequest.parse(req.body);
      const { runId, outcome } = await root.openScope(auth, (s) =>
        s.services.runs.createRun(auth, companyId, {
          planEntryIds: body.planEntryIds,
          channels: body.channels,
          counts: body.counts,
          topics: body.topics,
          angle: body.angle,
          agentModels: body.agentModels,
          saveAsDefault: body.saveAsDefault,
        }),
      );
      // 202, якщо enqueue впав ПІСЛЯ COMMIT (run збережено, доставку довершить sweep — §2.7.1).
      res.status(outcome.enqueue === "pending" ? 202 : 201).json({ runId });
    }),

    // Пре-ран оцінка вартості (Phase 4): ті самі вхідні дані, що create, але без запуску.
    estimate: asyncHandler(async (req: Request, res: Response) => {
      const auth = requireAuth(req);
      const companyId = companyIdParam.parse(req.params.companyId);
      const body = createRunRequest.parse(req.body);
      const est = await root.openScope(auth, (s) =>
        s.services.runs.estimateRun(auth, companyId, {
          planEntryIds: body.planEntryIds,
          channels: body.channels,
          counts: body.counts,
          topics: body.topics,
          angle: body.angle,
          agentModels: body.agentModels,
          saveAsDefault: body.saveAsDefault,
        }),
      );
      res.status(200).json(est);
    }),

    list: asyncHandler(async (req: Request, res: Response) => {
      const auth = requireAuth(req);
      const companyId = companyIdParam.parse(req.params.companyId);
      const q = listRunsQuery.parse(req.query);
      const result = await root.openScope(auth, (s) =>
        s.services.runs.list(auth, companyId, q),
      );
      res.status(200).json(result);
    }),

    get: asyncHandler(async (req: Request, res: Response) => {
      const auth = requireAuth(req);
      const id = idParam.parse(req.params.id);
      const run = await root.openScope(auth, (s) => s.services.runs.get(auth, id));
      res.status(200).json(run);
    }),

    items: asyncHandler(async (req: Request, res: Response) => {
      const auth = requireAuth(req);
      const id = idParam.parse(req.params.id);
      const q = itemsQuery.parse(req.query);
      const items = await root.openScope(auth, (s) => s.services.runs.items(auth, id, q));
      res.status(200).json(items);
    }),

    // Вивантаження пакета (FR-10.1/10.2). Віддаємо як attachment: браузер має ЗАВАНТАЖИТИ файл,
    // а не показати markdown у вкладці. Ім'я файлу формує сервіс (дата + короткий id прогону).
    export: asyncHandler(async (req: Request, res: Response) => {
      const auth = requireAuth(req);
      const id = idParam.parse(req.params.id);
      const { format } = exportQuery.parse(req.query);
      const file = await root.openScope(auth, (s) => s.services.runs.exportRun(auth, id, format));
      res.setHeader("Content-Type", file.contentType);
      res.setHeader("Content-Disposition", `attachment; filename="${file.filename}"`);
      res.status(200).send(file.body);
    }),
  };
}
