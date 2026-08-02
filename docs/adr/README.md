# Architecture Decision Records

Decisions that shape this codebase, why they were made, and what they cost. An ADR is not a
description of the architecture — it is a record of a **choice between alternatives**, so that a
later reader does not "fix" something that was done deliberately.

## Rules

- **ADRs are immutable.** If a decision changes, write a new ADR and mark the old one
  `Superseded by ADR-NNNN`. Never rewrite history — the reasoning of the past is the point.
- **One decision per record.** If you need "and" in the title, it is probably two ADRs.
- **Every ADR states its cost.** A decision with no downside was not a decision.
- **Every ADR states how it is enforced.** Without enforcement an ADR is a wish, not a guardrail.

## Adding a new one

Copy `template.md`, take the next free number, and link it here. Status starts as `Proposed`
and becomes `Accepted` once the change is merged.

## Index

| # | Decision | Status |
|---|---|---|
| [0001](0001-monorepo-with-hard-app-boundaries.md) | Monorepo with hard app boundaries | Accepted |
| [0002](0002-worker-is-the-sole-graph-executor.md) | Worker is the sole graph executor | Accepted |
| [0003](0003-tenant-isolation-via-postgres-rls.md) | Tenant isolation via Postgres RLS | Accepted |
| [0004](0004-pipeline-as-a-pure-library-behind-ports.md) | Pipeline as a pure library behind ports | Accepted |
| [0005](0005-contract-first-shared-package.md) | Contract-first: one package owns cross-app shapes | Accepted |
| [0006](0006-human-in-the-loop-gate.md) | Human-in-the-loop gate; the system never publishes | Accepted |
| [0007](0007-flagged-is-derived-not-a-status.md) | `flagged` is derived, not a status | Accepted |
| [0008](0008-model-config-is-a-run-snapshot.md) | Model config is a per-run snapshot | Accepted |
| [0009](0009-postgres-checkpointer-for-resume.md) | Postgres checkpointer for resume | Accepted |
| [0010](0010-short-transactions-never-across-llm-calls.md) | Short transactions, never across LLM calls | Accepted |
| [0011](0011-bounded-concurrency-inside-nodes.md) | Bounded concurrency inside graph nodes | Accepted |
| [0012](0012-image-generation-off-the-critical-path.md) | Image generation off the critical path | Accepted |
| [0013](0013-violations-must-be-grounded-in-a-quote.md) | Violations must be grounded in a quote | Accepted |
| [0014](0014-fake-models-require-an-explicit-flag.md) | Fake models require an explicit flag | Accepted |
| [0015](0015-rbac-enforced-at-the-application-layer.md) | RBAC is enforced at the application layer | Accepted |
