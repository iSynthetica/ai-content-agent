---
name: tests
description: Write or fix tests in this repository. Use when adding test coverage, when a test fails, or when deciding what deserves a test. Covers where tests live, the offline-with-fakes principle, and which parts of this codebase break silently without one.
---

## Layout

| Package | Location | Runner |
|---|---|---|
| `packages/pipeline` | `test/unit/`, `test/integration/` | vitest |
| `packages/evaluators` | `test/` | vitest |
| `apps/api` | `test/` | vitest |
| `apps/web`, `apps/worker` | none yet | — |

```bash
pnpm -r test                            # everything
pnpm --filter @forteq/pipeline test     # one package
```

## Principle: tests run offline

No network, no database, no API keys. Everything expensive enters through a port (ADR-0004), so
tests inject fakes through the same interface the worker uses — `test/fixtures/fakeModel.ts`. The
full interrupt/resume integration test runs on `MemorySaver` in tens of milliseconds.

A test that needs a real model is not a test; it is a manual verification (use the `verify` skill).

## What deserves a test here

Prioritise things that break **silently** — where a bug produces no exception, no type error, and a
successful-looking result:

- **Serialisation and mapping at seams.** A lost post in an export file is invisible in types and in
  `200 OK`. `apps/api/test/export.test.ts`.
- **Pure logic with invariants.** `mapPool` must preserve order, isolate failures, and respect its
  concurrency ceiling — all three are silently violable.
- **Code that filters model output.** `groundViolations` must drop hallucinated quotes *and* keep
  genuine findings phrased as negations. Test both directions.
- **State machines and routing.** Pure functions over state — cheap to test, expensive to debug.

Do not chase coverage on controllers and thin wrappers; they fail loudly.

## Writing a good assertion

Ask: **would this test fail if the feature were removed?** A check that "an image exists" passes
when nothing regenerated — it found the old one. Assert on the specific consequence: a new
timestamp, a second job id, a changed value.

Fixtures should be realistic. Token counts of 120/60 made cost round to zero and quietly disarmed an
assertion about cost accumulation.

## Fixing a failing test

Understand what it protected before changing it. If the test is now wrong because the contract
changed deliberately, update it and say so in the commit. If it is right, fix the code.
