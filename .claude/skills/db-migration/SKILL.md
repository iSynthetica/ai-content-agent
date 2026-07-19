---
name: db-migration
description: Create or apply a database migration for packages/db. Use when adding or altering a table, column, enum, index, or RLS policy, when writing a data backfill, or when drizzle-kit reports "column already exists" and migrations are blocked. Encodes the snapshot rule that previously bricked the migration chain.
---

Migrations here are half generated, half hand-written. Mixing the two without care blocks the whole
chain — it already happened once.

## Schema change (generated)

```bash
# 1. edit packages/db/src/schema.ts
pnpm db:generate     # writes drizzle/NNNN_*.sql AND the matching meta/NNNN_snapshot.json
pnpm db:migrate
```

Review the generated SQL before applying. Drizzle sometimes proposes a drop-and-recreate where an
`ALTER` is intended.

## Hand-written migration (RLS, backfill, anything drizzle cannot express)

Write the `.sql` file yourself, then append an entry to `drizzle/meta/_journal.json` with the next
`idx` and a matching `tag`.

**The trap:** a hand-written migration leaves the drizzle snapshot unaware of the change. The next
`pnpm db:generate` therefore re-proposes it as a new migration, and that duplicate fails with
`column ... already exists` — blocking every later migration.

This is what happened to `0005_abnormal_zodiak.sql` (a duplicate of the hand-written `0004`). It had
to be neutralised into `SELECT 1;`. Never delete such a file — it would shift journal indices.

After any hand-written DDL migration, either regenerate the snapshot or accept that the next
`generate` needs manual pruning. Prefer the former.

## RLS is mandatory for tenant tables

A new tenant table without a policy is a data leak, not a TODO (ADR-0003):

```sql
ALTER TABLE "x" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "x" FORCE ROW LEVEL SECURITY;
CREATE POLICY "x_tenant" ON "x"
  USING ("account_id" = NULLIF(current_setting('app.current_account_id', true), '')::uuid)
  WITH CHECK ("account_id" = NULLIF(current_setting('app.current_account_id', true), '')::uuid);
```

`NULLIF` is not optional: on pooled connections the GUC returns an empty string and `''::uuid`
fails every query.

## Data-shape migrations

Changing a stored JSON shape needs a backfill in the same migration, or every historical row breaks
its consumer. `0006_violations_grounded.sql` converts strings to `{quote, issue}` objects — use it as
the model.

## Verify

```bash
pnpm db:migrate
docker compose exec -T postgres psql -U forteq_owner -d forteq -c "\d <table>"
docker compose exec -T postgres psql -U forteq_owner -d forteq \
  -c "SELECT tablename, policyname FROM pg_policies WHERE tablename='<table>';"
```
