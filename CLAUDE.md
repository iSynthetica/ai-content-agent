# CLAUDE.md

Working instructions for this repo. Layout and quick start live in `README.md`; this file covers
what the code does not show: commands, hard boundaries, and landmines we already stepped on.

## Commands

```bash
pnpm -r typecheck                     # all 7 packages
pnpm -r test                          # 82 tests (pipeline, evaluators, api)
pnpm --filter @forteq/pipeline test   # single package

pnpm docker:up                        # postgres(5433) + redis + minio
pnpm db:migrate                       # apply migrations
pnpm --filter @forteq/api seed        # demo account: demo@forteq.dev / demo1234
pnpm --filter @forteq/worker setup:checkpointer   # once, needs owner role
```

**`.env` is NOT auto-loaded** — there is no dotenv in the code. Start services like this:

```bash
set -a; . ./.env; set +a
pnpm dev:api      # :4000
pnpm dev:worker
pnpm dev:web      # :3000
```

## Hard boundaries (breaking these is an architecture bug)

Each of these is recorded with its reasoning and cost in `docs/adr/`. If one looks wrong, read the
ADR before changing it — most of them exist because the obvious alternative was tried and failed.

1. **`apps/web` has no access to the DB or the pipeline.** HTTP to `api` only. Importing
   `@forteq/db|pipeline|evaluators` is blocked by lint — do not work around it.
2. **`apps/api` never runs the graph.** It only enqueues jobs. Only `worker` executes the graph.
3. **No DB access outside a scoped transaction.** RLS requires `SET LOCAL app.current_account_id`;
   repositories are not singletons and live exactly one transaction.
4. **Never hold a transaction open across an LLM call** (they take minutes). Pattern: short txn →
   work outside txn → short txn.
5. **`packages/pipeline` never reads `process.env`.** Everything arrives via ports and
   `PipelineInput`.

## Conventions

- **Code comments are written in Ukrainian.** Keep it that way — match the surrounding code.
  Comments explain *why*, not *what*; the most valuable ones cover non-obvious decisions and what
  breaks if you do the "more logical" thing instead.
- Schemas are Zod in `packages/shared`; neither web nor api defines its own data shapes.
- Statuses: `flagged` is **not a status** — it is derived from `violations.length > 0`.
- Per-item errors are isolated (`errors[]`); one failed post must not fail the whole run.

## Landmines

**Infrastructure**
- Postgres runs on **5433**, not 5432 (5432 is taken by another local instance).
- **Never run `next build` while `next dev` is running** — the production build overwrites `.next`
  and dev then returns 500 with `React Client Manifest`. Fix: `rm -rf apps/web/.next` and restart.
- **Only ONE worker at a time.** Multiple processes compete for jobs and the stale one often wins,
  which looks exactly like "my changes did not apply". Check with `ps aux | grep tsx`.
- BullMQ: queue names and `jobId` **must not contain a colon** — use dashes.

**Database**
- RLS policies must use `NULLIF(current_setting(...), '')::uuid`. On pooled connections the GUC
  comes back as an empty string, and `''::uuid` fails every query.
- Hand-written SQL migrations **must be followed by a snapshot update**, otherwise
  `drizzle-kit generate` emits a duplicate of an already-applied change and that duplicate blocks
  every later migration (`column ... already exists`). This already happened with `0005`.
- Checkpointer tables are created by the owner role; the runtime `forteq_app` role lacks the
  privileges — hence the separate `setup:checkpointer` step.

**LLM**
- GPT-5 / o-series accept **only the default temperature**; a custom one returns 400.
- Pass `reasoning_effort` via `modelKwargs`, not the typed parameter — the typed one is silently
  ignored (measured: 5s vs 23s on the same request).
- OpenAI structured outputs (strict) require **every field to be present**: `.optional()` without
  `.nullable()` rejects the schema before the call. The failure looks like "the model returned
  nothing".
- Fake models are enabled **only** by `FAKE_MODELS=1`. A missing API key fails worker startup on
  purpose: it used to silently generate fake content that was indistinguishable from real content
  in the UI.

**Data**
- `content_items.image_url` is owned **exclusively** by the `content.visuals` job. The pipeline
  persist path must not touch it — otherwise every revision wipes an already-rendered image.
- Violations must carry a verbatim quote from the post; `groundViolations` drops anything that
  cannot be quoted. Without it the model writes "no violations found" into the violations list.

## Where things live

| Changing | Look at |
|---|---|
| agent behaviour | `packages/pipeline/src/agents/*` + prompt in `src/prompts/*.md` |
| graph topology / HITL | `packages/pipeline/src/graph.ts`, `lib/routing.ts` |
| cross-app contract | `packages/shared/src/{contracts,jobs,events}.ts` |
| DB schema | `packages/db/src/schema.ts` + a new migration in `drizzle/` |
| an endpoint | `apps/api/src/http/routes/index.ts` → controller → service → repo |
| a background job | `apps/worker/src/router.ts` → `handlers/*` |
| an API call from the frontend | `apps/web/lib/endpoints.ts` (**proxy allowlist** + helper) |

**The allowlist in `apps/web/lib/endpoints.ts` must match the api routes.** It currently lists a few
endpoints that do not exist yet (planner, SSE, media) — those return 404. The drift-guard test is
not written, so verify manually when adding a route.

## Project state

Working end to end: company → brief → run (4 agents + auto-revisions) → HITL pause → decision →
resume → background images → MD/JSON export → notifications and inbox.

Not built: planner calendar, onboarding wizard with AI bootstrap, role-based RBAC, Dockerfiles for
the apps, e2e tests. Full breakdown and plan: `../agent-plan/05-retrospective.md`.

Architecture decisions and their rationale: `docs/adr/` — start with the index in
`docs/adr/README.md`.
