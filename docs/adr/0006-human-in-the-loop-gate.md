# ADR-0006: Human-in-the-loop gate; the system never publishes

**Status:** Accepted
**Date:** 2026-07-14

## Context

The product generates public-facing marketing copy about a real company. A hallucinated client name
or invented metric is a business risk, and no automated quality gate is good enough to accept that
risk unattended.

## Decision

Every run pauses at a dedicated `humanReviewGate` node via LangGraph `interrupt()`. The graph
cannot reach a terminal state without a human decision (`approve` / `reject` / `request_revision`).
The system never publishes anything anywhere.

Two **separate** revision loops, which must not be conflated:

- **Automatic:** Reviewer → Writer, hard cap `MAX_REVISIONS = 3`, no human involved.
- **Human:** gate → Writer, independent budget `MAX_HUMAN_REVISIONS`, resets the automatic counter.

## Alternatives considered

- **Auto-approve above a score threshold.** Tempting, but it converts a quality signal into a
  publishing decision, and the score is produced by the same class of model that wrote the text.
- **Conditional interrupt (pause only when flagged).** Rejected: it makes the human a fallback for
  the model's self-assessment. Always pausing is the honest contract.

## Consequences

- No unattended operation; throughput is bounded by human review.
- The graph needs a durable checkpointer (see ADR-0009) because a pause can outlive a process.
- Two revision budgets to reason about — a real source of confusion, hence this record.

## Enforcement

`interrupt()` in `packages/pipeline/src/graph.ts`; routing to `END` only happens after
`humanDecision` is materialised in state. The integration test in
`test/integration/interruptResume.test.ts` covers the roundtrip.
