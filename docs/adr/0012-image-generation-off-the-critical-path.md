# ADR-0012: Image generation off the critical path

**Status:** Accepted
**Date:** 2026-07-18
**Supersedes:** the in-graph `visual` node described in spike-1 §7.4 (FR-5.2, conditional edge)

## Context

Image generation was a conditional node between Writer and Reviewer. One `gpt-image-1` image takes
~40 seconds. Measured on a real run: 64 seconds to reach human review, of which 41 were image
rendering — 64% of the wait — while what the reviewer actually needs first is the **text**.

## Decision

The graph contains no image node. It reaches `needs_review` with text only. After persisting, the
worker enqueues a separate `content.visuals` job that renders images and writes
`content_items.image_url`.

`image_url` is owned **exclusively** by that job. The pipeline persist path must not write it.

Revisions invalidate the image explicitly: `handleResume` clears `image_url` for rewritten
Instagram posts and re-enqueues with a fresh job id.

## Alternatives considered

- **Keep it in the graph and parallelise images with review.** Saves a few seconds; the reviewer
  still waits for the slowest image.
- **Generate images only after approval.** Cheaper, but the reviewer approves a post without seeing
  its image.

## Consequences

- Time to review dropped from 64s to **20s**.
- The UI must handle a post whose image is not there yet — an explicit "generating" placeholder, and
  polling that continues after `needs_review` (the run poll stops there).
- `FinalItem.imageUrl` and the `visuals` state channel became vestigial and were removed; leaving
  them was what caused the persist path to wipe images on every revision.

## Enforcement

`image_url` is absent from the `onConflictDoUpdate` set in `apps/worker/src/lib/persist.ts`. The
pipeline has no image field in its final item schema, so it cannot write one.
