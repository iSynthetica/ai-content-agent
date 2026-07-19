# ADR-0002: Worker is the sole graph executor

**Status:** Accepted
**Date:** 2026-07-12

## Context

A content run takes tens of seconds to minutes. Running it inside an HTTP request means the client
holds a connection open, a deploy kills work in flight, and a retry re-runs paid LLM calls.

## Decision

`api` never executes the graph. It creates a `generation_run` row and enqueues a BullMQ job.
`worker` consumes the job and is the only process that calls `createPipeline().start/resume`.

Enqueue happens in an **after-commit hook**, not inside the transaction: a job must never reference
a run that a rollback removed.

## Alternatives considered

- **Run the graph in the API request.** Simplest, but ties run duration to HTTP timeouts and makes
  horizontal scaling of the API dependent on LLM latency.
- **Fire-and-forget promise in the API process.** Same problem plus silent loss on restart.

## Consequences

- Every user-visible run is asynchronous; the UI needs polling and status states.
- A queue and a Redis dependency become part of the minimum deployable set.
- In exchange: runs survive API restarts, retries are controlled by the queue, and API latency is
  independent of model latency.

## Enforcement

`apps/api` does not depend on `@forteq/pipeline` for execution — only for types. Any `await
createPipeline(...)` inside `apps/api` is a violation and should fail review.
