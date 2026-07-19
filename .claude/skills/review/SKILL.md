---
name: review
description: Review changes in this repository before committing or merging. Use when asked to review a diff, check work for correctness, or verify that a change respects the project's architectural boundaries. Checks against the recorded ADRs and the specific bug classes this codebase has already produced.
---

Review in this order. Stop at the first category with findings and report them — architectural
violations make style comments irrelevant.

## 1. Boundaries (ADR-0001, 0002, 0004)

- Does `apps/web` import `@forteq/db|pipeline|evaluators`? Lint should catch it; verify it was not
  disabled inline.
- Does `apps/api` execute the pipeline instead of enqueueing?
- Does `packages/pipeline` read `process.env` or construct a provider client directly?

## 2. Data safety (ADR-0003, 0010)

- New tenant table without an RLS policy?
- RLS policy without `NULLIF(current_setting(...), '')`?
- Any DB access outside `withAccountScope` / `openScope`?
- Any `await` on a model or network call **inside** a transaction callback?

## 3. Silent failure — the class this codebase produces most

- Does a failure path fall back to a plausible-but-wrong result instead of failing loudly? The fake
  model fallback wrote fake content indistinguishable from real content (ADR-0014).
- Is something dropped or filtered without a log? "Filtered everything" and "there was nothing" look
  identical from outside — see the grounding counters in the reviewer.
- Does a schema use `z.unknown()` / `z.record(z.unknown())` for a shape that is actually known? That
  is drift with a type annotation on top and it already caused 500s (ADR-0005).
- Does an error get swallowed by `catch {}` without a log?

## 4. Contract drift

- New endpoint present in `apps/api/src/http/routes/index.ts` but missing from the `ALLOW` list in
  `apps/web/lib/endpoints.ts` (or the reverse — the allowlist currently lists endpoints that do not
  exist)?
- Response shape changed in `packages/shared` without updating both consumers?

## 5. Correctness details

- Per-item work: are errors isolated so one failed item does not fail the run?
- Retryable job: is it idempotent? Does a retry duplicate paid work?
- Does a poll have a stop condition?
- Is a human decision ever overwritten by a model opinion (ADR-0007)?

## 6. Tests

- New pure function at a seam (serialisation, mapping, validation) without a test?
- Does a test assert on real behaviour, or would it pass even if the feature were removed? A check
  that finds "an image exists" passes when nothing regenerated.

## Report

State what is wrong, where, and what breaks as a result. Distinguish "this is a bug" from "this is a
preference". If a check could not be verified, say so rather than implying it passed.
