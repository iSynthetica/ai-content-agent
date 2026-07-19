import "server-only";

// Серверний доступ до сесії (spike-3 §7, §7.1). getSession читає сесійний cookie й питає api
// GET /v1/auth/session. Обгорнутий у React cache() → один мережевий виклик на один RSC-рендер
// (request memoization), а не N на кожен вкладений layout. Використовується у gate (app)/layout.
import { cache } from "react";
import { cookies } from "next/headers";
import type { z } from "zod";
import { sessionResponse } from "@forteq/shared";
import { SESSION_COOKIE } from "@/lib/auth-constants";

export type Session = z.infer<typeof sessionResponse>;

const API = process.env.API_INTERNAL_URL ?? "http://localhost:4000";
const MOCK = process.env.MOCK_API === "1";

// Dev-мок сесії — щоб екрани працювали без api (короткозамкнено до мережі).
const MOCK_SESSION: Session = {
  user: { id: "usr_demo", email: "owner@forteq.systems", name: "Forteq Owner" },
  account: { id: "acc_forteq", name: "Forteq", role: "owner" },
};

export const getSession = cache(async (): Promise<Session | null> => {
  if (MOCK) return MOCK_SESSION;

  const store = await cookies();
  if (!store.get(SESSION_COOKIE)) return null; // немає cookie → точно не залогінений

  try {
    const res = await fetch(API + "/v1/auth/session", {
      headers: { cookie: store.toString() },
      cache: "no-store",
    });
    if (!res.ok) return null; // 401/протухла → неавторизований
    const parsed = sessionResponse.safeParse(await res.json());
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
});
