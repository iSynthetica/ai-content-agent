# ADR-0016: Tenant provider keys are resolved at execution, never snapshotted

**Status:** Accepted
**Date:** 2026-08-02

## Context

The platform ran on a single `OPENAI_API_KEY` for every tenant: the demo account
generated on the platform's key, and any tenant's cost billed to us. BYOK (bring your
own key) makes each account bring its own provider key so it pays for its own
generation. That raises two coupled questions: where the key lives, and how it reaches
the LLM call.

The pipeline receives its models as a per-run snapshot (ADR-0008): the resolved
`ModelConfig` is written into `PipelineInput`, persisted in the graph state, and read
back on `resume`. The obvious move is to put the tenant key on the same path.

## Decision

The tenant key is **resolved at execution time** in the worker, keyed by `accountId`,
and **never** enters `PipelineInput` or the checkpointer.

- Keys are stored per account (`api_keys`, one row per provider), encrypted with the
  app master key (`BYOK_ENCRYPTION_KEY`, AES-256-GCM). Only `last4` is ever readable.
- At `generation.start`, `generation.resume`, `content.visuals`,
  `onboarding.bootstrap` and `planner.suggest_topics`, the worker loads and decrypts
  the account's keys and builds the `ModelFactory` on those secrets, then runs the graph
  with that factory. `ModelConfig` (model ids, provider) is still snapshotted; the
  **key** is not.
- **Block, no fallback.** Without a key for the required provider the work is blocked:
  a run fails with a clear message and an inbox task, bootstrap records
  `bootstrap_status=failed`, a visuals job skips the image (off the critical path). The
  platform key is never used for a tenant's generation. The api pre-checks at run
  creation for an immediate `422`; the worker is the authoritative gate.
- In real mode the **global** model builder throws. Every generating path must resolve
  a tenant factory explicitly; a path that forgets fails loudly instead of silently
  falling back to an environment key.

## Alternatives considered

- **Snapshot the key into the run (like `ModelConfig`).** Simplest to wire, and `resume`
  would get it for free. Rejected: it writes a live secret into `generation_runs` and the
  LangGraph checkpointer — plaintext-adjacent secrets duplicated across every run and job
  payload, surviving as long as the run history does. A key belongs in one encrypted,
  rotatable place, not smeared through state.
- **Keep the platform key as a fallback.** Kinder to onboarding, but it defeats the
  entire point: the demo would still burn our key, and "your key or ours" quietly
  becomes "ours". The product decision was an explicit block.
- **Read the key inside the pipeline.** Forbidden by ADR-0004 — the pipeline never reads
  configuration or environment; secrets arrive through the `ModelFactory` port.

## Consequences

- `resume` re-resolves the key, so deleting a key mid-flight blocks the resume — correct,
  and the reason resolution is not cached on the run.
- Onboarding now needs a key before the AI bootstrap can draft a brief, so the intended
  flow is create account → add key → onboard/generate. Stated so it is not mistaken for a
  regression.
- Worker startup requires `BYOK_ENCRYPTION_KEY` in real mode instead of a platform LLM
  key. `FAKE_MODELS=1` still bypasses keys entirely for offline/CI runs.
- Tavily (web search) stays platform-level for now — it is enrichment, not the cost
  centre BYOK targets. A future ADR can extend BYOK to it if needed.

## Enforcement

The global real-mode builder throws (`composition.ts`), so no generating path can reach
an LLM without a tenant factory. `NoTenantKeyError` is the single block signal, handled
per handler. `packages/db` crypto is unit-tested (round-trip, wrong key, tampered
ciphertext). End-to-end verified: no key → `422`; a real tenant key → a real run to
`needs_review` with `last_used_at` set. A new generating handler that calls the global
`ctx.pipeline.models` directly instead of `tenantModelsBuilder` is a review blocker.
