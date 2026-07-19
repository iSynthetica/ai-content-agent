# ADR-0014: Fake models require an explicit flag

**Status:** Accepted
**Date:** 2026-07-19

## Context

The worker fell back to deterministic fake models when no LLM key was present. The intent was
convenience for offline plumbing tests. The effect was that a missing `OPENAI_API_KEY` produced a
worker that started normally, generated fake content, marked runs `needs_review`, and wrote rows
that were indistinguishable from real content in the UI. A single lost environment variable would
fill the database with nonsense and emit no signal beyond one warning line.

## Decision

Fake models are enabled by `FAKE_MODELS=1` and by nothing else. Missing keys without that flag is a
**fatal startup error**.

## Alternatives considered

- **Keep the fallback, make the warning louder.** Logs are not read during normal operation, and
  the resulting data is already indistinguishable downstream.
- **Mark runs produced by fake models in the database.** Solves detection but not the root problem:
  the system should not silently substitute a different product.

## Consequences

- A first-time contributor without a key gets a startup failure instead of a running system. The
  error message names the flag, which makes this a better first experience than silent fakes.
- CI and smoke tests must set `FAKE_MODELS=1` explicitly.

## Enforcement

`buildDeps` in `apps/worker/src/composition.ts` throws when no key is present and the flag is unset;
`main()` exits non-zero. Both branches are exercised manually — an automated test is a known gap.
