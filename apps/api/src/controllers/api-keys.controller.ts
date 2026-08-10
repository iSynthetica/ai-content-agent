import type { Request, Response } from "express";
import { apiKeyProviderSchema, setApiKeyRequest } from "@forteq/shared";
import type { Composition } from "../composition";
import { asyncHandler } from "../http/async-handler";
import { requireAuth } from "../http/middlewares/auth";

// BYOK — керування ключами провайдерів КОМПАНІЇ (§per-company-settings). companyId — у path; сервіс
// звіряє приналежність компанії акаунту. list читає будь-який член (статус для UI); set/remove під
// apikey:manage (роути). Відповідь ніколи не несе самого ключа — лише last4.
export function apiKeysController(root: Composition) {
  return {
    list: asyncHandler(async (req: Request, res: Response) => {
      const auth = requireAuth(req);
      const companyId = req.params.companyId!;
      const items = await root.openScope(auth, (s) => s.services.apiKeys.list(auth, companyId));
      res.status(200).json({ items });
    }),

    set: asyncHandler(async (req: Request, res: Response) => {
      const auth = requireAuth(req);
      const companyId = req.params.companyId!;
      const provider = apiKeyProviderSchema.parse(req.params.provider);
      const body = setApiKeyRequest.parse(req.body);
      await root.openScope(auth, (s) =>
        s.services.apiKeys.set(auth, companyId, provider, body.key, body.label),
      );
      res.status(204).end();
    }),

    remove: asyncHandler(async (req: Request, res: Response) => {
      const auth = requireAuth(req);
      const companyId = req.params.companyId!;
      const provider = apiKeyProviderSchema.parse(req.params.provider);
      await root.openScope(auth, (s) => s.services.apiKeys.remove(auth, companyId, provider));
      res.status(204).end();
    }),
  };
}
