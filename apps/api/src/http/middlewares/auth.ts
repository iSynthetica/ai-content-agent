import type { Request, Response, NextFunction, RequestHandler } from "express";
import type { Composition } from "../../composition";
import type { AuthCtx } from "../../di/types";
import { AppError } from "../errors";
import { resolveSession } from "../../auth/resolve";

// req.auth — ЄДИНЕ джерело accountId (§9.4). Клієнт не може вказати чужий accountId: він береться
// з сесії, а далі RLS форсить ізоляцію на рівні БД.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthCtx;
    }
  }
}

// auth-middleware ПЕРЕДУЄ request-scope (openScope): дає req.auth, після чого контролер відкриває
// головну txn з SET LOCAL app.current_* (§2.10.3). МВП-скоуп: перша/єдина membership користувача.
export function authMiddleware(root: Composition): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction): void => {
    resolveSession(root.auth, root.db, req.headers)
      .then((resolved) => {
        if (!resolved) {
          next(AppError.unauthorized("no active session"));
          return;
        }
        req.auth = {
          accountId: resolved.accountId,
          userId: resolved.userId,
          role: resolved.role,
        };
        next();
      })
      .catch(next);
  };
}

// requireAuth — вузол типобезпеки: контролери під auth-middleware гарантовано мають req.auth.
export function requireAuth(req: Request): AuthCtx {
  if (!req.auth) throw AppError.unauthorized();
  return req.auth;
}
