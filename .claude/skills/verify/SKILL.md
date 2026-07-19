---
name: verify
description: Run the stack locally and confirm a change actually works end to end. Use after implementing anything that touches generation, the queue, or the review flow, or when asked to check that something works for real rather than only typechecking. Covers environment loading, the single-worker rule, and how to drive a full run.
---

Typecheck and unit tests do not prove the system works — most failures in this project were runtime
behaviour that compiled perfectly.

## Start the stack

```bash
pnpm docker:up                      # postgres(5433), redis, minio

set -a; . ./.env; set +a             # .env is NOT auto-loaded; there is no dotenv in the code
pnpm dev:api                         # :4000
pnpm dev:worker
pnpm dev:web                         # :3000
```

**Run exactly ONE worker.** Concurrent workers compete for jobs and the stale process often wins,
which looks exactly like "my change did not apply":

```bash
ps aux | grep 'tsx' | grep -v grep    # expect one worker
```

A worker without an LLM key fails to start by design (ADR-0014). That is correct behaviour, not a
bug — set the key or `FAKE_MODELS=1`.

## Drive a real run

```bash
curl -s -c /tmp/c -X POST http://localhost:4000/v1/auth/sign-in \
  -H 'Content-Type: application/json' -d '{"email":"demo@forteq.dev","password":"demo1234"}'

CID=c0000000-0000-4000-8000-000000000001
RID=$(curl -s -b /tmp/c -X POST "http://localhost:4000/v1/companies/$CID/runs" \
  -H 'Content-Type: application/json' -d '{}' | sed 's/.*"runId":"//;s/".*//')

curl -s -b /tmp/c "http://localhost:4000/v1/runs/$RID"          # status
curl -s -b /tmp/c "http://localhost:4000/v1/runs/$RID/items"    # generated posts
curl -s -b /tmp/c "http://localhost:4000/v1/inbox"              # the review task
```

Expect `needs_review` in roughly 20 seconds; images arrive later, around 60–70 seconds.

## Read the worker log

Per-node lines report what actually happened: `research done`, `plan built`, `writer done` with
draft and error counts, `reviewer violations grounding` with claimed-versus-grounded counts. A node
finishing in milliseconds means it processed nothing.

## Verify honestly

Design the check so it fails when the feature is broken:

- Polling for "an image exists" right after triggering a revision finds the **old** image and passes
  regardless. Compare identifiers or timestamps, or read the log for a second render.
- Zero results can mean success or a filter that ate everything. Find the counter that tells them
  apart before declaring victory.

Report what you observed, including anything that did not work.
