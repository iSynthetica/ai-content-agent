# ADR-0003: Tenant isolation via Postgres RLS

**Status:** Accepted
**Date:** 2026-07-12

## Context

The platform is multi-tenant from day one. Application-level filtering (`WHERE account_id = ...`)
depends on every query being written correctly forever; a single forgotten predicate leaks another
customer's content.

## Decision

Isolation is enforced by the database. Every tenant table has `ENABLE` + `FORCE ROW LEVEL SECURITY`
and a policy comparing `account_id` to `current_setting('app.current_account_id')`.

Three database roles:

- `forteq_owner` — migrations and DDL,
- `forteq_app` — runtime (non-superuser, subject to RLS),
- `forteq_sweeper` — `BYPASSRLS`, reserved for cross-tenant reconciliation only.

Every request and every job opens a transaction with `SET LOCAL app.current_account_id` before
touching data. Repositories are built per transaction and are never singletons.

Policies must use `NULLIF(current_setting(...), '')::uuid`.

## Alternatives considered

- **Application-level filtering only.** Cheaper, but the failure mode is a silent cross-tenant leak
  and the guarantee degrades with every new query.
- **Schema per tenant.** Strong isolation, but migrations and connection management scale badly and
  the product has no requirement that justifies it yet.

## Consequences

- Local development needs the roles provisioned; a plain superuser connection hides RLS bugs.
- Background work must carry an account context explicitly — there is no ambient "system" access.
- The `NULLIF` detail is mandatory: on pooled connections the GUC returns an empty string, and
  `''::uuid` raised on **every** query until migration `0003` fixed it.

## Enforcement

`FORCE ROW LEVEL SECURITY` means even the table owner is subject to policies. Runtime uses
`forteq_app`, which cannot bypass them. Any new tenant table without a policy is a review blocker.
