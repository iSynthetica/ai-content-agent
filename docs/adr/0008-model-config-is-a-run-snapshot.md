# ADR-0008: Model config is a per-run snapshot

**Status:** Accepted
**Date:** 2026-07-14

## Context

Which model each agent uses is a per-company setting that changes over time. If the pipeline read
the current setting at execution time, a run resumed a day later — or retried after a settings
change — would silently use different models than the run that produced the drafts.

## Decision

The resolved model configuration is snapshotted into `PipelineInput` when the run is created and
persisted in the graph state. `resume` reads it from the checkpointer, never from settings.

Background jobs derived from a run (for example image generation) carry the same snapshot.

## Alternatives considered

- **Read settings at execution time.** Simpler, but makes a run non-reproducible and turns a
  settings change into a silent retroactive edit of in-flight work.
- **Environment variables.** Removes per-company configuration entirely.

## Consequences

- Snapshot data is duplicated per run — cheap, and it is exactly what makes a run auditable.
- Changing a setting does not affect runs already in flight, which is occasionally surprising and
  always correct.

## Enforcement

`resolveModelConfig(snapshot, DEFAULT_MODELS)` is the only resolution path;
`packages/pipeline` cannot read configuration any other way (ADR-0004).
