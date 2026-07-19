import "server-only";

// Серверний apiClient (spike-3 §2.2, §4). RSC б'ють в api НАПРЯМУ (минаючи BFF-allowlist —
// серверний код trusted, сам формує URL з endpoints-білдерів). Додає сесійний cookie з
// next/headers, Zod-парсить відповідь, кидає єдиний ApiError. У dev-моках — фікстури.
//
// Приймає той самий шлях, що й клієнт (з /api), і нормалізує його: /api/<rest> → api /v1/<rest>.
import { cookies } from "next/headers";
import type { ZodType } from "zod";
import { toApiError } from "@/lib/api-error";
import { stripApiPrefix } from "@/lib/endpoints";
import { getMock } from "@/server/mocks";

const API = process.env.API_INTERNAL_URL ?? "http://localhost:4000";
const MOCK = process.env.MOCK_API === "1";

async function safeJson(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  schema?: ZodType<T>,
): Promise<T> {
  const rest = stripApiPrefix(path);

  if (MOCK) {
    const mock = getMock(method, rest, new URLSearchParams(), body);
    if (mock) {
      const status = mock.status ?? 200;
      if (status >= 400) throw toApiError(status, mock.json);
      return schema ? schema.parse(mock.json) : (mock.json as T);
    }
  }

  const cookieHeader = (await cookies()).toString();
  const headers: Record<string, string> = { cookie: cookieHeader };
  if (body !== undefined) headers["content-type"] = "application/json";

  const res = await fetch(API + "/v1" + rest, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store", // доменні дані — завжди свіжі на сервері
  });

  if (!res.ok) {
    throw toApiError(res.status, await safeJson(res));
  }
  if (res.status === 204) {
    return undefined as T;
  }
  const data = await safeJson(res);
  return schema ? schema.parse(data) : (data as T);
}

export const apiClient = {
  get: <T>(path: string, schema?: ZodType<T>) => request<T>("GET", path, undefined, schema),
  post: <T>(path: string, body?: unknown, schema?: ZodType<T>) => request<T>("POST", path, body, schema),
  put: <T>(path: string, body?: unknown, schema?: ZodType<T>) => request<T>("PUT", path, body, schema),
  patch: <T>(path: string, body?: unknown, schema?: ZodType<T>) => request<T>("PATCH", path, body, schema),
};
