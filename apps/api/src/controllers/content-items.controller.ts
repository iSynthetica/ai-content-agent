import type { Request, Response } from "express";
import { z } from "zod";
import { editContentItemRequest, revertContentItemRequest } from "@forteq/shared";
import type { Composition } from "../composition";
import { asyncHandler } from "../http/async-handler";
import { requireAuth } from "../http/middlewares/auth";

const idParam = z.string().uuid();

// Людське редагування поста + версії (§content-editing). На відміну від decisions.controller —
// синхронна правка вмісту, без enqueue/графа: PATCH і revert повертають оновлений contentItemDTO
// одразу з тієї самої scoped-txn.
export function contentItemsController(root: Composition) {
  return {
    // PATCH /v1/content-items/:id — { text, title? }. RBAC: content:edit (роут-гвард).
    edit: asyncHandler(async (req: Request, res: Response) => {
      const auth = requireAuth(req);
      const id = idParam.parse(req.params.id);
      const body = editContentItemRequest.parse(req.body);
      const updated = await root.openScope(auth, (s) =>
        s.services.contentItems.editItem(auth, id, body),
      );
      res.status(200).json(updated);
    }),

    // GET /v1/content-items/:id/versions — історія версій, найновіша перша. Read — без RBAC-гварда
    // (будь-який член акаунта), ізоляцію форсить RLS.
    versions: asyncHandler(async (req: Request, res: Response) => {
      const auth = requireAuth(req);
      const id = idParam.parse(req.params.id);
      const items = await root.openScope(auth, (s) => s.services.contentItems.listVersions(auth, id));
      res.status(200).json({ items });
    }),

    // POST /v1/content-items/:id/revert — { versionId }. RBAC: content:edit (той самий гвард, що
    // й edit — revert теж переписує вміст поста за людину).
    revert: asyncHandler(async (req: Request, res: Response) => {
      const auth = requireAuth(req);
      const id = idParam.parse(req.params.id);
      const body = revertContentItemRequest.parse(req.body);
      const updated = await root.openScope(auth, (s) =>
        s.services.contentItems.revertItem(auth, id, body.versionId),
      );
      res.status(200).json(updated);
    }),

    // POST /v1/content-items/:id/archive — м'яке архівування (§post-archive). RBAC: content:edit
    // (оборотна дія). Тіло порожнє. Відповідь — оновлений contentItemDTO (з archivedAt).
    archive: asyncHandler(async (req: Request, res: Response) => {
      const auth = requireAuth(req);
      const id = idParam.parse(req.params.id);
      const updated = await root.openScope(auth, (s) =>
        s.services.contentItems.archiveItem(auth, id),
      );
      res.status(200).json(updated);
    }),

    // POST /v1/content-items/:id/unarchive — розархівувати (§post-archive). RBAC: content:edit.
    unarchive: asyncHandler(async (req: Request, res: Response) => {
      const auth = requireAuth(req);
      const id = idParam.parse(req.params.id);
      const updated = await root.openScope(auth, (s) =>
        s.services.contentItems.unarchiveItem(auth, id),
      );
      res.status(200).json(updated);
    }),

    // DELETE /v1/content-items/:id — незворотне видалення (§post-archive). RBAC: content:delete
    // (owner/admin). Сервіс вимагає попередньої архівації (інакше 422). 204 без тіла.
    remove: asyncHandler(async (req: Request, res: Response) => {
      const auth = requireAuth(req);
      const id = idParam.parse(req.params.id);
      await root.openScope(auth, (s) => s.services.contentItems.deleteItem(auth, id));
      res.status(204).end();
    }),
  };
}
