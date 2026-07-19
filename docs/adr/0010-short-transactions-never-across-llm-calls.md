# ADR-0010: Short transactions, never across LLM calls

**Status:** Accepted
**Date:** 2026-07-15

## Context

Job handlers need database access before and after a run, and the run itself takes minutes. The
natural shape — open a transaction, do the work, commit — would hold a Postgres connection and its
locks for the entire duration of external API calls.

## Decision

Handlers follow a fixed rhythm: **short scoped transaction → work outside any transaction → short
scoped transaction**. A transaction is never open while an LLM or image call is in flight.

Each transaction sets its own RLS context (ADR-0003); after-commit work opens a fresh scope.

## Alternatives considered

- **One transaction per job.** Atomic and simple, but exhausts the connection pool under a handful
  of concurrent runs and holds locks for minutes.

## Consequences

- Persistence is not atomic across a whole job: a crash between the two transactions can leave a
  run marked `running` with no items. Reconciliation is a known gap, not an oversight.
- Handlers are longer and more explicit about their phases.

## Enforcement

`withAccountScope` wraps each short transaction. Code review checkpoint: any `await` on a model or
network call inside a `withAccountScope` callback is a violation.
