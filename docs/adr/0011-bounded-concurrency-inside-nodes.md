# ADR-0011: Bounded concurrency inside graph nodes

**Status:** Accepted
**Date:** 2026-07-18

## Context

Writer and Reviewer processed posts with a sequential `for ... of await` loop. Per-item LLM calls
are independent, so a node's duration was the **sum** of per-item latencies: 8 posts × ~4.4s ≈ 35s
for writing and ~32s for review. Run-to-run variance tracked plan size, not model behaviour.

## Decision

Per-item work inside a node runs through `mapPool` — a worker pool with a fixed concurrency limit
(`ITEM_CONCURRENCY = 4` for text, `IMAGE_CONCURRENCY = 2` for images).

The pool preserves three invariants: result **order** matches input order, a failing item is
isolated rather than fatal, and cost accumulation stays deterministic.

## Alternatives considered

- **`Promise.all` over all items.** Maximum parallelism and immediate rate-limit rejections from
  the provider at realistic plan sizes.
- **Leave it sequential.** Predictable, but wall-clock scales linearly with plan size for no reason.

## Consequences

- A concurrency limit is one more thing to tune per provider.
- Node duration becomes the slowest item rather than the sum — writer dropped from ~35s to ~9s.
- Failure isolation had to be built explicitly; an unhandled rejection in a pool is easy to lose.

## Enforcement

`packages/pipeline/src/lib/mapPool.ts` with unit tests covering order preservation, error
isolation, the concurrency ceiling, and actual parallelism.
