import "server-only";

// Ядро BFF-проксі (spike-3 §6.1). Тонкий форвард /api/<rest> → api /v1/<rest>:
//   • whitelist заголовків до api (content-type/cookie/x-request-id/origin/referer);
//   • passthrough Set-Cookie окремими append через getSetCookie() (auth-критично);
//   • 2xx — стрім тіла наскрізь (нуль-копі, важливо для export/media);
//   • не-2xx — приведення до єдиного ApiError-envelope (§3.3);
//   • мережева помилка/timeout → 502 UPSTREAM з людським меседжем;
//   • x-request-id для спостережуваності.
// Path allowlist (isAllowed) перевіряється у route-handler ДО виклику forward().
import { getMock } from "@/server/mocks";
import { languageFromCookieHeader } from "@/lib/i18n/cookie";
import { translate } from "@/lib/i18n/translate";

const API = process.env.API_INTERNAL_URL ?? "http://localhost:4000";
const MOCK = process.env.MOCK_API === "1";

function human502(cookieHeader: string | null) {
  return {
    error: {
      code: "UPSTREAM",
      message: translate(languageFromCookieHeader(cookieHeader), "Сервіс генерації тимчасово недоступний. Спробуйте ще раз."),
    },
  };
}

// Заголовки, які форвардимо ДО api (усе інше відкидається).
const REQUEST_WHITELIST = ["content-type", "cookie", "x-request-id", "origin", "referer"];
// Заголовки відповіді, які пробрасуємо браузеру (Set-Cookie — окремо через getSetCookie()).
const RESPONSE_WHITELIST = ["content-type", "content-disposition", "cache-control"];

function jsonResponse(status: number, obj: unknown, requestId: string): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json", "x-request-id": requestId },
  });
}

function buildForwardHeaders(req: Request, requestId: string): Headers {
  const out = new Headers();
  for (const h of REQUEST_WHITELIST) {
    const v = req.headers.get(h);
    if (v) out.set(h, v);
  }
  out.set("x-request-id", requestId);
  return out;
}

function passthroughHeaders(res: Response, requestId: string): Headers {
  const out = new Headers();
  for (const h of RESPONSE_WHITELIST) {
    const v = res.headers.get(h);
    if (v) out.set(h, v);
  }
  // КРИТИЧНО: Better Auth ставить КІЛЬКА Set-Cookie; наївний get() склеює їх комою й ламає
  // cookie. Читаємо масив getSetCookie() і append кожен окремим рядком.
  for (const c of res.headers.getSetCookie()) out.append("set-cookie", c);
  out.set("x-request-id", requestId);
  return out;
}

// Тільки для не-2xx: читаємо тіло api ПОВНІСТЮ й приводимо до ApiError (§3.3).
async function normalizeError(res: Response, requestId: string, cookieHeader: string | null): Promise<Response> {
  const text = await res.text();
  let parsed: unknown;
  try {
    parsed = text ? JSON.parse(text) : undefined;
  } catch {
    parsed = undefined;
  }
  const isEnvelope =
    !!parsed &&
    typeof parsed === "object" &&
    "error" in parsed &&
    !!(parsed as { error?: { code?: unknown; message?: unknown } }).error &&
    typeof (parsed as { error: { code?: unknown } }).error.code === "string";

  if (isEnvelope) {
    return jsonResponse(res.status, parsed, requestId);
  }
  return jsonResponse(res.status, {
    error: {
      code: "INTERNAL",
      message: translate(languageFromCookieHeader(cookieHeader), "Сталася непередбачена помилка. Спробуйте ще раз."),
      requestId,
    },
  }, requestId);
}

// restPath — вхідний шлях БЕЗ префікса /api (напр. "/runs/123/items"), вже перевірений isAllowed().
export async function forward(req: Request, restPath: string): Promise<Response> {
  const requestId = req.headers.get("x-request-id") ?? crypto.randomUUID();
  const inUrl = new URL(req.url);
  const method = req.method;
  const bodyText = method === "GET" || method === "HEAD" ? undefined : await req.text();

  // Dev-моки: короткозамикаємо форвард (без мережі до api).
  if (MOCK) {
    let parsedBody: unknown;
    try {
      parsedBody = bodyText ? JSON.parse(bodyText) : undefined;
    } catch {
      parsedBody = undefined;
    }
    const mock = getMock(method, restPath, inUrl.searchParams, parsedBody);
    if (mock) {
      return jsonResponse(mock.status ?? 200, mock.json, requestId);
    }
  }

  const url = new URL("/v1" + restPath, API); // /api/<rest> → api /v1/<rest> (канон api-contract.md)
  inUrl.searchParams.forEach((v, k) => url.searchParams.set(k, v));

  const init: RequestInit = {
    method,
    headers: buildForwardHeaders(req, requestId),
    // МВП: форвардимо лише text/json body. Multipart/binary upload не підтримується (§6.1).
    body: bodyText,
    redirect: "manual",
  };

  const cookieHeader = req.headers.get("cookie");

  let res: Response;
  try {
    res = await fetch(url, init);
  } catch {
    return jsonResponse(502, human502(cookieHeader), requestId);
  }

  if (res.ok) {
    // Стрім тіла наскрізь (нуль-копі). Passthrough content-type/disposition + Set-Cookie.
    return new Response(res.body, { status: res.status, headers: passthroughHeaders(res, requestId) });
  }
  return normalizeError(res, requestId, cookieHeader);
}
