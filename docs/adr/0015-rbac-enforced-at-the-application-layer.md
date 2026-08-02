# ADR-0015: RBAC is enforced at the application layer

**Status:** Accepted
**Date:** 2026-08-02

## Context

Roles (`owner/admin/editor/reviewer/viewer`) were designed from day one — the `role` enum, the
`memberships.role` column, and even `app.current_role` pushed into a GUC on every scoped
transaction — but nothing read them. Any authenticated member of an account could do everything:
a `viewer` could start runs and approve posts. For a paid multi-tenant product this is a blocker,
not a polish item.

The question is not *whether* to enforce roles but *at which layer*. Tenant isolation already lives
in the database (ADR-0003, RLS). The obvious move is to extend RLS with per-role policies — and a
comment in `0001_rls_policies.sql` anticipated exactly that.

## Decision

RBAC is enforced in the **application layer**, as a route-level guard, not in RLS.

- The permission matrix lives in `packages/shared/src/permissions.ts`: a `Permission` enum of
  operational intents (`company:write`, `run:start`, `decision:make`, `apikey:manage`, …) and
  `ROLE_PERMISSIONS: Record<Role, Permission[]>`. `can(role, permission)` is the single check.
- `apps/api` mounts `requirePermission(permission)` on each mutating route, between the
  auth-middleware and the controller. Insufficient role → `403` before any transaction opens.
- `GET` routes carry no guard: any authenticated member reads (`viewer`), and RLS forces tenant
  isolation regardless.
- The matrix is in `shared` because both sides need it: `api` to enforce, `web` to hide actions a
  role cannot take. One source of truth, so the frontend hides exactly what the backend forbids.

The matrix is stated explicitly per role rather than as a rank ladder. The five roles happen to form
a capability chain today (`viewer ⊂ reviewer ⊂ editor ⊂ admin ⊂ owner`), but the moment a
non-linear role appears (e.g. `billing`) a rank model would silently lie.

## Alternatives considered

- **Per-role RLS policies on `app.current_role`.** RLS is *row-level*: it decides which rows a query
  may touch. RBAC here is *operation-level* — `approve` and `read` hit the same row, and RLS cannot
  tell them apart without encoding verbs into policies per table per operation. That is far more
  surface than a route guard, harder to read, and still would not cover non-DB actions like
  enqueuing a run. RLS stays responsible for tenant isolation; RBAC is a separate concern.
- **Checks inside each service method.** Works, but scatters the policy across dozens of call sites
  where a reviewer cannot see the whole matrix. A guard at the route table keeps the policy where a
  reader looks for it.

## Consequences

- `owner` and `admin` are identical in the wired matrix today: the only thing that would separate
  them — deleting an account — has no endpoint yet. The distinction materialises when
  `account:delete` is added, not before. Stated in a comment so it is not mistaken for a bug.
- Two layers now guard a mutation (RBAC at the edge, RLS at the row). That is defence in depth, but
  it means a denied action can fail with either `403` (role) or a silent empty result (tenant) — the
  guard runs first, so role failures are the loud, early ones.
- Adding a route means also choosing its permission. A route with no guard is a decision to allow
  every member, and must be a deliberate one (notifications/inbox are ungated on purpose — a personal
  feed, not content mutation).

## Enforcement

`apps/api/test/rbac.test.ts` pins the full matrix (an independent copy that must break if
`permissions.ts` widens a role) and both branches of the guard — allow and deny — for representative
roles. The route-level wiring is verified by reading the route table; a viewer reaching a mutating
route is a review blocker. A new mutating route without `requirePermission` is caught in review, not
by a type — that gap is named here, not hidden.
