// Єдиний тип помилки на межі web↔api (spike-3 §3.3). Клієнтський http (lib/http.ts)
// і серверний apiClient (server/api-client.ts) обидва кидають ApiError — тож обробка
// (toast/redirect/field-errors) уніфікована в одному місці.
import { apiError } from "@forteq/shared";

export interface ApiErrorShape {
  code: string;
  message: string;
  fields?: Record<string, string>;
  requestId?: string;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fields?: Record<string, string>;
  readonly requestId?: string;

  constructor(status: number, shape: ApiErrorShape) {
    super(shape.message);
    this.name = "ApiError";
    this.status = status;
    this.code = shape.code;
    this.fields = shape.fields;
    this.requestId = shape.requestId;
  }
}

// Витягує envelope { error: { code, message } } з тіла відповіді api (spike-3 §3.3).
// Якщо тіло не відповідає envelope — деградуємо до INTERNAL з людським меседжем (NFR-3.2).
export function toApiError(status: number, body: unknown): ApiError {
  const parsed = apiError.safeParse(body);
  if (parsed.success) {
    const raw = body as {
      error: { fields?: Record<string, string>; requestId?: string };
    };
    return new ApiError(status, {
      code: parsed.data.error.code,
      message: parsed.data.error.message,
      fields: raw.error.fields,
      requestId: raw.error.requestId,
    });
  }
  return new ApiError(status, {
    code: "INTERNAL",
    message: "Сталася непередбачена помилка. Спробуйте ще раз.",
  });
}

// 401/UNAUTHORIZED — окремий клас (глобальний хендлер робить редірект на /login, §7).
export function isAuthError(err: unknown): boolean {
  return err instanceof ApiError && (err.status === 401 || err.code === "UNAUTHORIZED");
}
