// Схема відповіді для айтемів run (без "use client" — споживають і RSC-сторінка, і client-hook).
import { z } from "zod";
import { contentItemDTO } from "@forteq/shared";

export type ContentItemDTO = z.infer<typeof contentItemDTO>;

// GET /api/runs/:id/items → реальний api віддає ГОЛИЙ масив ContentItem[] (звірено з apps/api
// runs.controller.items → res.json(items)). Тримаємо строгий масив — тип чистий (ContentItemDTO[]),
// без union-звуження. Якщо форму api колись змінять на { items } — це окремий контракт-фікс.
export const itemsResponse = z.array(contentItemDTO);
