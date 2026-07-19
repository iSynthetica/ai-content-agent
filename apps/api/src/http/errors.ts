import { ZodError } from "zod";

// Коди помилок каркаса → HTTP-статуси. Envelope межі — {error:{code,message}} (api-contract §9.1).
export type ErrorCode =
  | "bad_request"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "unprocessable"
  | "internal";

const STATUS_BY_CODE: Record<ErrorCode, number> = {
  bad_request: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  unprocessable: 422,
  internal: 500,
};

export interface ErrorEnvelope {
  error: { code: string; message: string };
}

// AppError — доменна помилка з кодом і HTTP-статусом. Кидається сервісами/контролерами;
// централізований error-handler (server.ts) мапить її в envelope. Фабрики нижче — під §2.9/§4.4.
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;

  constructor(code: ErrorCode, message: string) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = STATUS_BY_CODE[code];
  }

  static badRequest(message = "bad request"): AppError {
    return new AppError("bad_request", message);
  }
  static unauthorized(message = "unauthorized"): AppError {
    return new AppError("unauthorized", message);
  }
  static forbidden(message = "forbidden"): AppError {
    return new AppError("forbidden", message);
  }
  static notFound(resource = "resource"): AppError {
    return new AppError("not_found", `${resource} not found`);
  }
  static conflict(message = "conflict"): AppError {
    return new AppError("conflict", message);
  }
  static unprocessable(message = "unprocessable entity"): AppError {
    return new AppError("unprocessable", message);
  }
  static internal(message = "internal server error"): AppError {
    return new AppError("internal", message);
  }
}

// Мапер будь-якої помилки у пару {status, envelope}. AppError → свій код/статус;
// ZodError (validate-middleware, Фаза 1) → 422; усе інше → 500 без витоку деталей.
export function toErrorEnvelope(err: unknown): { status: number; body: ErrorEnvelope } {
  if (err instanceof AppError) {
    return { status: err.status, body: { error: { code: err.code, message: err.message } } };
  }
  if (err instanceof ZodError) {
    const message = err.issues
      .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("; ");
    return { status: 422, body: { error: { code: "unprocessable", message } } };
  }
  return { status: 500, body: { error: { code: "internal", message: "internal server error" } } };
}
