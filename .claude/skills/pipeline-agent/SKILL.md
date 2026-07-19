---
name: pipeline-agent
description: Add or modify an agent node in packages/pipeline (researcher, strategist, writer, reviewer), change a prompt, or alter graph topology and routing. Use when the task involves LangGraph nodes, structured LLM output, prompt files, or the human review gate. Covers the OpenAI strict-schema rule that silently produced zero content.
---

## Anatomy of an agent

- `src/agents/<name>.ts` — a node factory `makeXNode(deps)` returning `(state) => Partial<State>`.
- `src/prompts/<name>.md` — the prompt, with `{placeholders}` filled by `fillTemplate`.
- Structured output through `callStructured(model, Schema, prompt, modelId)` — this is the single
  place that captures token usage, so cost tracking depends on going through it.

## The rule that costs the most when broken

OpenAI structured outputs in strict mode require **every field to be present**. A Zod `.optional()`
without `.nullable()` makes the API reject the schema *before* the call.

```ts
// WRONG — rejected, and the failure surfaces as "the model returned nothing"
imagePromptSuggestion: z.string().optional()

// RIGHT — field always present, value may be null
imagePromptSuggestion: z.string().nullable()
```

This produced runs with zero content items while every node reported success.

## Model behaviour

- GPT-5 / o-series accept **only the default temperature**; a custom one returns 400.
- Pass `reasoning_effort` through `modelKwargs`, not the typed parameter — the typed one is silently
  ignored (measured 5s vs 23s on an identical request).
- Model ids come from `state.modelConfig`, never from env (ADR-0004, ADR-0008).

## Per-item work

Independent per-item LLM calls go through `mapPool` with a concurrency limit, never a sequential
loop and never an unbounded `Promise.all` (ADR-0011). Preserve the three invariants: input order,
per-item error isolation into `errors[]`, deterministic cost accumulation.

## Trusting model output

Never trust a model's self-report as a signal. Verify it in code against something objective — the
reviewer checks that each violation quotes the actual post text (ADR-0013). If a check cannot be
grounded in verifiable data, it will degrade into noise.

## Graph topology

`src/graph.ts` plus pure routing functions in `src/lib/routing.ts`. Two revision loops with
independent budgets — automatic (`MAX_REVISIONS`) and human (`MAX_HUMAN_REVISIONS`); do not merge
them (ADR-0006). Long side work belongs outside the graph in its own job (ADR-0012).

## Verify

```bash
pnpm --filter @forteq/pipeline test        # offline, fakes, no network
pnpm --filter @forteq/pipeline typecheck
```

Then a real run — model behaviour is not covered by fakes. Use the `verify` skill.
