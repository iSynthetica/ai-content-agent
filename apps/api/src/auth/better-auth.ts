import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import type { DB } from "@forteq/db";
import type { AppConfig } from "../config/env";
import { baAccount, baSession, baUser, baVerification } from "./schema";

// Better Auth self-host, email+password (spike-2 §2.6, §2.8). drizzleAdapter мапить логічні моделі
// на ba_-таблиці. Конектиться під тим самим пулом (forteq_app), але ba_-таблиці НЕ під RLS —
// auth читається до появи account-контексту (§2.10.2). Наші /v1/auth/* — тонкі обгортки, що кличуть
// auth.api.* всередину (не проксі), тож Better Auth не протікає у web (§2.8.4).
export function createAuth(db: DB, config: AppConfig) {
  return betterAuth({
    secret: config.AUTH_SECRET,
    baseURL: config.PUBLIC_BASE_URL ?? `http://localhost:${config.API_PORT}`,
    // Наш стек монтується під /v1 (server.ts: app.use("/v1/auth", ...)). basePath вирівнює
    // внутрішні URL Better Auth під /v1/auth замість дефолтного /api/auth (§2.8.4). Самі
    // /v1/auth/* — тонкі обгортки, що кличуть auth.api.* всередину (не toNodeHandler-проксі).
    basePath: "/v1/auth",
    trustedOrigins: [config.CORS_ORIGIN],
    emailAndPassword: { enabled: true },
    // drizzleAdapter → ba_-таблиці, provider "pg" (Postgres). Явний мапінг логічних моделей
    // Better Auth (user/session/account/verification) на ba_-pgTable зі schema.ts.
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: {
        user: baUser,
        session: baSession,
        account: baAccount,
        verification: baVerification,
      },
    }),
  });
}

export type Auth = ReturnType<typeof createAuth>;
