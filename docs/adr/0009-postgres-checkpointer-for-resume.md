# ADR-0009: Postgres checkpointer for resume

**Status:** Accepted
**Date:** 2026-07-14

## Context

ADR-0006 makes every run pause for a human. That pause can last hours or days, and it must survive
a worker restart, a deploy, or the decision being handled by a different worker instance.

## Decision

The graph uses `PostgresSaver` from `@langchain/langgraph-checkpoint-postgres`. `threadId` equals
the run id. `MemorySaver` is used only in tests.

Image bytes are **never** placed in graph state — only URLs — so checkpoint rows stay small.

## Alternatives considered

- **`MemorySaver`.** Zero setup; loses every paused run on restart, which is incompatible with
  ADR-0006.
- **Custom serialisation of state into `generation_runs`.** Reimplements a solved problem and
  diverges from LangGraph's resume semantics.

## Consequences

- Checkpoint tables need provisioning by the owner role — the runtime role lacks `CREATE`. Hence
  the separate `pnpm --filter @forteq/worker setup:checkpointer` step.
- Checkpoint rows are an operational concern (growth, cleanup) that MVP does not yet manage.

## Enforcement

The checkpointer is injected through `PipelineDeps`; the pipeline never constructs one. Worker
startup logs explicitly whether checkpointer setup ran.
