# ADR-0017: Per-role provider and model, added additively

**Status:** Accepted
**Date:** 2026-08-02

Extends ADR-0008 (model config is a per-run snapshot — still in force) and ADR-0016 (tenant keys).

## Context

Model choice was one provider per company plus a model id per agent role *within* that provider
(`ModelConfig = { provider, models: Record<slot, string> }`). The owner asked for full flexibility:
each agent role should be able to run on its own provider and model — researcher on Gemini, writer
on Claude, reviewer on GPT — with a separate key per provider.

The constraint that shapes the answer: the resolved `ModelConfig` is snapshotted into the LangGraph
checkpointer (ADR-0008). Production already holds in-flight runs whose checkpointer state carries the
**old** shape. Reshaping the type outright would break `resume` for every one of them.

## Decision

Per-role selection is added **additively**, not by reshaping the stored config.

- `ModelConfig` keeps `provider` and `models` as the **fallback**, and gains an optional
  `agentModels?: Partial<Record<ModelSlot, { provider, model }>>`. A slot with an override uses its
  provider+model; a slot without one falls back to the top-level provider and model id. `slotModel()`
  is the single resolver.
- Old resolved configs (no `agentModels`) read unchanged, so in-flight runs resume correctly — this
  is the whole reason for the additive shape rather than a normalisation pass.
- Storage is an additive nullable column `company_settings.agent_models`; existing rows need no
  backfill. `null` means legacy single-provider mode.
- **BYOK key requirement becomes a union** (extends ADR-0016): a run needs a key for **every**
  provider used across its text slots (`textProvidersUsed`), plus OpenAI for images. The api
  pre-checks the union; the worker enforces it. Onboarding bootstrap and topic suggestion require
  only the one slot's provider they use.
- Images stay on OpenAI regardless of any slot's provider.

## Alternatives considered

- **Reshape `ModelConfig` to `models: Record<slot, {provider, model}>` and normalise old snapshots.**
  Cleaner as a type, but it forces a normalisation layer for the checkpointer's in-flight states and
  a live-data migration of `company_settings.models`. The additive field avoids both and is strictly
  backward compatible — a slot the old code never wrote is simply absent.
- **A second top-level provider only (text vs image).** Too coarse; the ask was per role.

## Consequences

- Two places now describe a slot's model (the fallback `models[slot]` and an optional
  `agentModels[slot]`). Agents read the model id through `slotModel()` so cost accounting bills the
  model actually used, not the fallback — a mismatch here would silently misprice a run.
- A run can now require several provider keys; a partially-keyed account is blocked with the name of
  the first missing provider until it is added.
- The fallback `provider`/`models` never disappear, which keeps the door open to simple
  single-provider setups without forcing every account onto the per-role matrix.

## Enforcement

`textProvidersUsed`/`slotModel` are the only resolution paths; the union pre-check lives in
`runs.service` and the authoritative block in the worker (`tenantModelsBuilder` takes the required
provider set). Verified end to end: a writer override to a provider without a key blocks the run with
that provider's name, and a per-slot override across OpenAI models runs to `needs_review`. Actual
cross-provider generation (a slot genuinely on Anthropic or Gemini) still needs those provider keys
to confirm, Gemini's function-calling structured output in particular (ADR notes carried from 0016).
