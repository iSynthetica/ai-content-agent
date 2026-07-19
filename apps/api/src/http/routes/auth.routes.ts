import { Router } from "express";
import type { Composition } from "../../composition";
import { authController } from "../../controllers/auth.controller";

// /v1/auth/* монтується БЕЗ business-auth-middleware — це сам вхід у сесію (§6.1).
export function authRoutes(root: Composition): Router {
  const r = Router();
  const c = authController(root);
  r.post("/sign-in", c.signIn);
  r.post("/sign-out", c.signOut);
  r.get("/session", c.session);
  return r;
}
