import type { RequestHandler } from "express";
import { type Permission, can } from "@forteq/shared";
import { AppError } from "../errors";
import { requireAuth } from "./auth";

// requirePermission — route-level RBAC-гвард. Стоїть у ланцюжку ПІСЛЯ auth-middleware (req.auth уже
// є) і ДО контролера: недостатня роль → 403 ще до відкриття txn, зайвих запитів у БД не робимо.
//
// Enforcement саме на app-рівні (а не в RLS): RBAC — операційний (approve ≠ read), а RLS —
// рядковий; він ізолює орендарів, але не розрізняє «читати» від «схвалити». Матриця — у
// @forteq/shared, тож фронт ховає ті самі дії, що бек забороняє (одне джерело правди).
export function requirePermission(permission: Permission): RequestHandler {
  return (req, _res, next) => {
    const { role } = requireAuth(req);
    if (!can(role, permission)) {
      next(AppError.forbidden(`role '${role}' is not allowed to '${permission}'`));
      return;
    }
    next();
  };
}
