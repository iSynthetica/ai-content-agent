import express, {
  type Express,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import { randomUUID } from "node:crypto";
import type { Composition } from "./composition";
import { AppError, toErrorEnvelope } from "./http/errors";
import { authMiddleware } from "./http/middlewares/auth";
import { authRoutes } from "./http/routes/auth.routes";
import { businessRoutes } from "./http/routes/index";

// Розширення Express.Request полями каркаса (заповнює request-context middleware).
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      requestId?: string;
    }
  }
}

// createServer(root) збирає Express-app: middlewares + роути. Тонкий — уся логіка у сервісах (§2.2).
export function createServer(root: Composition): Express {
  const app = express();
  app.disable("x-powered-by");

  // CORS (§9.5): точний origin web + credentials — інакше cookie-сесія Better Auth не переживе
  // крос-origin web:3000↔api:4000 (§2.8.4). Клієнт шле credentials:'include'.
  app.use((req: Request, res: Response, next: NextFunction) => {
    res.setHeader("Access-Control-Allow-Origin", root.config.CORS_ORIGIN);
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Request-Id");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,PUT,DELETE,OPTIONS");
    if (req.method === "OPTIONS") {
      res.sendStatus(204);
      return;
    }
    next();
  });

  app.use(express.json());

  // request-id: беремо з заголовка або генеруємо; ехо у відповідь (для трасування логів).
  app.use((req: Request, res: Response, next: NextFunction) => {
    const id = req.header("x-request-id") ?? randomUUID();
    req.requestId = id;
    res.setHeader("x-request-id", id);
    next();
  });

  // Liveness для docker/оркестратора — поза /v1, без auth (§5.2).
  app.get("/health", (_req: Request, res: Response) => {
    res.json({ status: "ok" });
  });

  // /v1/health — ПУБЛІЧНИЙ liveness під версійним префіксом. Реєструємо ПЕРЕД auth-middleware,
  // інакше потрапляє під /v1-гейт і віддає 401 без сесії (§5.2).
  app.get("/v1/health", (_req: Request, res: Response) => {
    res.json({ status: "ok" });
  });

  // /v1/auth/* — тонкі обгортки Better Auth, БЕЗ business-auth-middleware (це сам вхід у сесію).
  app.use("/v1/auth", authRoutes(root));

  // Бізнес /v1/* — за auth-middleware (req.auth) + request-scope (openScope у контролерах, §2.10.3).
  app.use("/v1", authMiddleware(root), businessRoutes(root));

  // 404 для невідомих маршрутів → єдиний envelope.
  app.use((_req: Request, _res: Response, next: NextFunction) => {
    next(AppError.notFound("route"));
  });

  // Централізований error-handler: AppError/ZodError/невідомі → HTTP-статус + {error:{code,message}}.
  app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
    const { status, body } = toErrorEnvelope(err);
    if (status >= 500) {
      root.logger.error({ err, requestId: req.requestId }, "unhandled error");
    }
    res.status(status).json(body);
  });

  return app;
}
