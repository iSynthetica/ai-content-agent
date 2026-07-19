# ADR-0001: Monorepo with hard app boundaries

**Status:** Accepted
**Date:** 2026-07-12

## Context

The product needs a UI, an HTTP API, and a background executor for long agent runs. The obvious
shortcut in a Next.js project is to talk to the database (and to the agent pipeline) directly from
server components and route handlers.

## Decision

One pnpm monorepo, three applications with a one-way dependency direction:

- `apps/web` — presentation and a BFF proxy. It talks to `api` over HTTP and to nothing else.
- `apps/api` — the only entry point to the database and to job scheduling.
- `apps/worker` — the only executor of the agent graph.

Shared code lives in `packages/{shared,db,pipeline,evaluators}`.

## Alternatives considered

- **Next.js full-stack (server actions + Drizzle in the app).** Fastest to start, but it puts
  tenant-sensitive DB access and minutes-long LLM calls inside a request/response lifecycle that
  is not built for either, and it makes the pipeline untestable outside a Next runtime.
- **Separate repositories.** Real isolation, but cross-cutting contract changes would need
  coordinated releases from day one, at a stage where the contracts are still moving.

## Consequences

- Three processes to run locally instead of one; a proxy layer to maintain in `web`.
- Every new frontend capability needs an API endpoint — no shortcuts.
- In exchange: the pipeline is testable offline, the API is reusable by non-web clients, and
  tenant isolation has exactly one enforcement point.

## Enforcement

`apps/web/.eslintrc.json` blocks importing `@forteq/db`, `@forteq/pipeline`, `@forteq/evaluators`
via `no-restricted-imports`. This is a lint error, not a convention.
