---
name: background-job
description: Add or modify a BullMQ background job in apps/worker. Use when the task involves the job queue, a new worker handler, enqueueing follow-up work, long-running processing outside the request cycle, or transaction and RLS scoping inside a handler.
---

## The chain

1. **Contract** — `packages/shared/src/jobs.ts`: a Zod object with a literal `kind`, added to the
   `job` discriminated union. Every payload carries `accountId` (RLS context) and a deterministic
   `jobId`.
2. **Handler** — `apps/worker/src/handlers/<name>.ts`.
3. **Router** — `apps/worker/src/router.ts`. The `switch` is exhaustive: a missing case fails the
   `never` branch at compile time.
4. **Producer** — `api` enqueues via `QueuePort` in an after-commit hook; `worker` enqueues
   follow-up work via `ctx.producer`.

## Transaction rhythm (mandatory)

Short scoped transaction → work outside any transaction → short scoped transaction (ADR-0010).
Never hold a transaction across an LLM or image call.

```ts
const input = await withAccountScope(ctx, accountId, async (tx) => { /* read */ });
const result = await doExpensiveWork(input);          // NO transaction here
await withAccountScope(ctx, accountId, async (tx) => { /* persist */ });
```

## Idempotency

BullMQ retries. A handler that is not idempotent duplicates paid work and rows.

- Deterministic `jobId` gives queue-level dedup. Work that must genuinely repeat (a revision
  re-render) needs a fresh nonce, or dedup silently swallows it.
- Guard at the data level too: `content.visuals` only renders items where `image_url IS NULL`.

## Failure policy

Decide explicitly whether a failure is fatal:

- Core work failing → mark the run `failed`, emit the domain event.
- Auxiliary work failing (a notification, one image) → log and continue. A successfully generated
  run must not be marked failed because a notification insert failed.

## Domain events

Notifications and inbox tasks use the shared catalog in `packages/shared/src/events.ts` — both `api`
and `worker` emit, and the catalog keeps their wording and types identical. `notification` informs;
`inbox item` demands action and auto-resolves when the underlying decision is made.

## Verify

```bash
pnpm --filter @forteq/worker typecheck
```

Run exactly ONE worker (concurrent workers compete and the stale one often wins), trigger the job,
and read the log — handlers log start and completion with the run id.
