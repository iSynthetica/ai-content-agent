// Клієнтський fetch-wrapper до BFF (/api/*) з Zod-парсингом і єдиним ApiError (spike-3 §3.3, §8.3).
// Використовується у клієнтських TanStack Query hooks. Сервер має власний apiClient (server/api-client.ts).
import type { ZodType } from "zod";
import { toApiError } from "@/lib/api-error";

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
  url: string,
  body?: unknown,
  schema?: ZodType<T>,
): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: "same-origin", // httpOnly-сесія в cookie того самого origin
  });

  if (!res.ok) {
    throw toApiError(res.status, await safeJson(res));
  }
  if (res.status === 204) {
    return undefined as T;
  }
  const data = await safeJson(res);
  // Zod-парсинг робить контракт явним там, де він важливий — у типах (spike-3 §6.3).
  return schema ? schema.parse(data) : (data as T);
}

export const http = {
  get: <T>(url: string, schema?: ZodType<T>) => request<T>("GET", url, undefined, schema),
  post: <T>(url: string, body?: unknown, schema?: ZodType<T>) => request<T>("POST", url, body, schema),
  put: <T>(url: string, body?: unknown, schema?: ZodType<T>) => request<T>("PUT", url, body, schema),
  patch: <T>(url: string, body?: unknown, schema?: ZodType<T>) => request<T>("PATCH", url, body, schema),
  del: <T>(url: string, schema?: ZodType<T>) => request<T>("DELETE", url, undefined, schema),
};
