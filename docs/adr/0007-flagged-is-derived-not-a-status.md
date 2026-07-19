# ADR-0007: `flagged` is derived, not a status

**Status:** Accepted
**Date:** 2026-07-14

## Context

The pipeline's internal QA vocabulary includes `flagged`, but the workflow vocabulary of a content
item is `draft | needs_revision | approved | rejected`. Adding `flagged` to the database enum would
mix "what the reviewer thinks" with "where this item is in the human workflow".

## Decision

`flagged` is **not** a status in the API, the database enum, or the UI state machine. It is derived:
`violations.length > 0`. The pipeline's internal `flagged` maps to `needs_revision` when persisted.

## Alternatives considered

- **Add `flagged` to the enum.** One less mapping, but then an item can be simultaneously
  "approved by a human" and "flagged by a model", and every consumer must decide which wins.

## Consequences

- One mapping layer between the pipeline's QA vocabulary and the persisted workflow vocabulary.
- A human decision is never overwritten by a model opinion.
- The derived badge is only as meaningful as the violations list — see ADR-0013, which exists
  because the badge had become meaningless.

## Enforcement

`STATUS_MAP` in `apps/worker/src/lib/mapToRows.ts` is total over the pipeline statuses. The item
status enum in `packages/db/src/schema.ts` has no `flagged` member.
