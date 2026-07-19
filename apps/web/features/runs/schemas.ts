// Схеми відповіді для runs (без "use client" — споживають і RSC-сторінки, і клієнтські hooks).
import { z } from "zod";
import { runDTO } from "@forteq/shared";

export type RunDTO = z.infer<typeof runDTO>;

// GET /api/companies/:cid/runs → Paged (spike-3 §3.4, звірено з apps/api runs.list →
// Paged<RunSummary>): { items, page, pageSize, total }. Рядки списку — без counts (counts
// лишень у деталі GET /runs/:id).
export const pagedRuns = z.object({
  items: z.array(runDTO),
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
});
export type PagedRuns = z.infer<typeof pagedRuns>;
