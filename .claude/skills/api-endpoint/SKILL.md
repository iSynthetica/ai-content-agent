---
name: api-endpoint
description: Add, change, or remove an HTTP endpoint in apps/api. Use when the task mentions a new route, an API contract change, exposing data to the frontend, or when a frontend call returns 404 from the proxy. Covers the full chain from the shared Zod contract through controller/service/repository down to the web proxy allowlist.
---

An endpoint is not done when the route responds. It is done when the frontend can reach it through
the BFF proxy and the shape is validated on both sides.

## The chain, in order

1. **Contract** — `packages/shared/src/contracts.ts`. Request and response as Zod schemas, exported
   with their inferred types. Never describe a known shape as `z.record(z.unknown())` — a loose
   schema is drift with a type annotation on top (see ADR-0005; this exact mistake returned 500s on
   the review page).
2. **Repository** — `apps/api/src/repositories/`. Interface in `interfaces.ts`, Drizzle
   implementation in its own file. Every method takes `accountId` as its first argument. Register in
   `buildRepos`.
3. **Service** — `apps/api/src/services/`. Business rules and state-machine guards live here, not in
   the controller. Throw `AppError.notFound` / `.conflict` / `.forbidden`; never return raw nulls to
   the controller.
4. **Controller** — `apps/api/src/controllers/`. Parse params and query with Zod, call
   `root.openScope(auth, (s) => s.services.X.method(...))`, set the status code. No business logic.
5. **Route** — `apps/api/src/http/routes/index.ts`. Business routes go under the auth middleware;
   only `/v1/auth/*` and health are public.
6. **Proxy allowlist** — `apps/web/lib/endpoints.ts`. Add the regex to `ALLOW` **and** a helper to
   `endpoints`. Missing this is the most common failure: the route works with curl and 404s from the
   browser.
7. **Frontend hook** — `apps/web/features/<area>/use-*.ts` with TanStack Query, parsing the response
   through the shared schema.

## Rules

- Mutations that trigger background work enqueue in an **after-commit hook**, never inside the
  transaction (ADR-0002): a job must not reference a row a rollback removed.
- `api` never runs the pipeline. If the endpoint needs generation, it enqueues a job.
- Anything crossing the seam is validated at runtime, not just typed.

## Verify

```bash
pnpm --filter @forteq/api typecheck
curl -s -b /tmp/cookies -X POST http://localhost:4000/v1/auth/sign-in \
  -H 'Content-Type: application/json' -d '{"email":"demo@forteq.dev","password":"demo1234"}'
curl -s -b /tmp/cookies http://localhost:4000/v1/<your-route>          # direct
curl -s -b /tmp/cookies http://localhost:3000/api/<your-route>         # through the proxy
```

Both must succeed. If the direct call works and the proxy returns 404, step 6 is missing.
