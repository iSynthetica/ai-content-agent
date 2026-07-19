# ADR-0005: Contract-first — one package owns cross-app shapes

**Status:** Accepted
**Date:** 2026-07-13

## Context

Three applications exchange data over two seams: HTTP (`web` ↔ `api`) and a queue (`api` ↔
`worker`). If each side declares its own types, the seams drift silently — types compile on both
sides while the runtime shapes disagree.

## Decision

`packages/shared` is the single source of truth for everything crossing an app boundary: API DTOs
(`contracts.ts`), queue payloads (`jobs.ts`), and domain event semantics (`events.ts`). All are Zod
schemas, so they validate at runtime, not only at compile time.

Neither `web` nor `api` defines its own shape for data that crosses a seam.

## Alternatives considered

- **Per-app types with manual mirroring.** Zero coupling, guaranteed drift.
- **OpenAPI generation.** Good for external consumers; heavier tooling than a TypeScript monorepo
  needs when both sides share a compiler.

## Consequences

- A contract change touches one package and ripples through everything — intentionally loud.
- Runtime validation costs a little performance and catches malformed payloads at the edge.
- Drift is still possible where a shape is described loosely. This already happened: `violations`
  was typed as `z.record(z.unknown())` while the pipeline emitted strings, types stayed silent, and
  the review page returned 500 on every run that had violations.

## Enforcement

Zod parsing at both edges (`http.get(..., schema)` in web, `jobSchema.parse` in worker). The lesson
from the incident above: **avoid `z.unknown()` / `z.record(z.unknown())` for shapes that are
actually known** — a loose schema is drift with a type annotation on top.
