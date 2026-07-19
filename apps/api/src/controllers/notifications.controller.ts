import type { Request, Response } from "express";
import { z } from "zod";
import type { Composition } from "../composition";
import { asyncHandler } from "../http/async-handler";
import { requireAuth } from "../http/middlewares/auth";

const idParam = z.string().uuid();

// Нотифікації (дзвіночок) та Inbox (actionable-задачі) — §2.13. Два різні концепти, два набори
// ендпоінтів: перші лише читаються/позначаються прочитаними, другі закриваються дією людини.
export function notificationsController(root: Composition) {
  return {
    list: asyncHandler(async (req: Request, res: Response) => {
      const auth = requireAuth(req);
      const out = await root.openScope(auth, (s) => s.services.feed.listNotifications(auth));
      res.status(200).json(out);
    }),

    markRead: asyncHandler(async (req: Request, res: Response) => {
      const auth = requireAuth(req);
      const id = idParam.parse(req.params.id);
      await root.openScope(auth, (s) => s.services.feed.markRead(auth, id));
      res.status(204).end();
    }),

    markAllRead: asyncHandler(async (req: Request, res: Response) => {
      const auth = requireAuth(req);
      await root.openScope(auth, (s) => s.services.feed.markAllRead(auth));
      res.status(204).end();
    }),

    inbox: asyncHandler(async (req: Request, res: Response) => {
      const auth = requireAuth(req);
      const out = await root.openScope(auth, (s) => s.services.feed.listInbox(auth));
      res.status(200).json(out);
    }),

    resolveInbox: asyncHandler(async (req: Request, res: Response) => {
      const auth = requireAuth(req);
      const id = idParam.parse(req.params.id);
      await root.openScope(auth, (s) => s.services.feed.resolveInbox(auth, id));
      res.status(204).end();
    }),
  };
}
