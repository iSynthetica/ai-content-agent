# ADR-0004: Pipeline as a pure library behind ports

**Status:** Accepted
**Date:** 2026-07-13

## Context

The agent pipeline is the part most likely to change and the most expensive to exercise: every run
costs money and takes minutes. If it reads environment variables and calls SDKs directly, it can
only be tested against live providers.

## Decision

`packages/pipeline` is a library with no side effects of its own. Everything that costs money or
touches the outside world enters through five ports: `ModelFactory`, `ImageModel`, `WebSearchTool`,
`ImageStore`, `Logger`.

The package **never reads `process.env`**. Secrets are resolved in the worker's composition root and
closed over inside the factory; the pipeline never sees them.

Public surface is a single factory: `createPipeline(deps)` with `start` / `resume` / `getState`.

## Alternatives considered

- **Direct SDK calls inside agents.** Less indirection, but tests then require real API keys and
  real latency, and swapping providers touches every agent.
- **A DI container (tsyringe/awilix).** Solves wiring we do not have — the composition root is
  ~50 lines and explicit wiring is easier to follow.

## Consequences

- More types and a composition root to maintain.
- Tests inject fakes and run offline: the full interrupt/resume integration test finishes in tens
  of milliseconds with no network.
- Changing providers is a composition-root change, not an agent change.

## Enforcement

`packages/pipeline` has no `process.env` reference. Adding one breaks the contract and should fail
review. Tests inject `FakeModelFactory` through the same interface the worker uses.
