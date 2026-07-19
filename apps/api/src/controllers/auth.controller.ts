import type { Request, Response } from "express";
import { z } from "zod";
import { fromNodeHeaders } from "better-auth/node";
import { roleSchema, sessionResponse } from "@forteq/shared";
import type { Composition } from "../composition";
import { asyncHandler } from "../http/async-handler";
import { AppError } from "../http/errors";
import { resolveByEmail, resolveSession, type ResolvedAuth } from "../auth/resolve";

// /v1/auth/* — ТОНКІ обгортки над Better Auth (§2.8.4): валідують нашою Zod-схемою, кличуть
// auth.api.* всередину, форвардять Set-Cookie і серіалізують НАШ sessionResponse (доменні id).
const signInSchema = z.object({ email: z.string().email(), password: z.string().min(8) });

function toSessionRes(r: ResolvedAuth): z.infer<typeof sessionResponse> {
  return {
    user: { id: r.userId, email: r.email, name: r.name },
    // role у домені — довільний рядок; звужуємо до канонічного roleSchema для контракту межі.
    account: { id: r.accountId, name: r.accountName, role: r.role as z.infer<typeof roleSchema> },
  };
}

export function authController(root: Composition) {
  return {
    signIn: asyncHandler(async (req: Request, res: Response) => {
      const body = signInSchema.parse(req.body);
      const authRes = await root.auth.api.signInEmail({
        body: { email: body.email, password: body.password },
        asResponse: true,
      });
      for (const cookie of authRes.headers.getSetCookie()) res.append("Set-Cookie", cookie);
      if (!authRes.ok) throw AppError.unauthorized("invalid credentials");

      // Cookie ще в response (не в request), тож будуємо сесію-відповідь напряму з email.
      const resolved = await resolveByEmail(root.db, body.email);
      if (!resolved) throw AppError.unauthorized("user is not provisioned in domain");
      res.status(200).json(toSessionRes(resolved));
    }),

    signOut: asyncHandler(async (req: Request, res: Response) => {
      const authRes = await root.auth.api.signOut({
        headers: fromNodeHeaders(req.headers),
        asResponse: true,
      });
      for (const cookie of authRes.headers.getSetCookie()) res.append("Set-Cookie", cookie);
      res.status(200).json({ ok: true });
    }),

    session: asyncHandler(async (req: Request, res: Response) => {
      const resolved = await resolveSession(root.auth, root.db, req.headers);
      if (!resolved) throw AppError.unauthorized("no active session");
      res.status(200).json(toSessionRes(resolved));
    }),
  };
}
