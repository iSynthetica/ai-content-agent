// Універсальний BFF catch-all (spike-3 §6). Обробляє ВСІ проксовані методи (включно з /api/auth/*):
//   1) збирає restPath із сегментів ([...proxy]) — шлях api без префікса /api;
//   2) security-gate: isAllowed(method, restPath) — недозволений шлях → 404 БЕЗ мережевого виклику
//      (закриває SSRF-подібний обхід непроксованих ендпойнтів api);
//   3) forward() — cookie/Set-Cookie passthrough, normalize errors, 502, x-request-id.
import { isAllowed } from "@/lib/endpoints";
import { forward } from "@/server/proxy";

// Проксі має бути повністю динамічним (cookie, no cache).
export const dynamic = "force-dynamic";

async function handle(
  req: Request,
  ctx: { params: Promise<{ proxy?: string[] }> },
): Promise<Response> {
  const { proxy } = await ctx.params;
  const restPath = "/" + (proxy?.join("/") ?? "");

  if (!isAllowed(req.method, restPath)) {
    return Response.json(
      { error: { code: "NOT_FOUND", message: "Ресурс не знайдено." } },
      { status: 404 },
    );
  }

  return forward(req, restPath);
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
