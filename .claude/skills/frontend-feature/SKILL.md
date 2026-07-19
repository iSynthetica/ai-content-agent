---
name: frontend-feature
description: Build or change a page, component, or data hook in apps/web. Use when the task involves UI, React components, TanStack Query, polling, server versus client components, design tokens, or wiring a frontend call to the API. Covers the polling rule that previously hid background results.
---

## Boundaries

`apps/web` reaches the API over HTTP and nothing else. Importing `@forteq/db`, `@forteq/pipeline` or
`@forteq/evaluators` is a lint error (ADR-0001). Data shapes come from `@forteq/shared`; the
frontend does not define its own.

## Where code goes

| Kind | Location |
|---|---|
| Route / page | `app/(app)/...` — server component, fetches initial data |
| Feature hook | `features/<area>/use-*.ts` — TanStack Query |
| Feature component | `features/<area>/*.tsx` |
| Reusable UI | `components/common/*` (domain) or `components/ui/*` (primitives) |
| API endpoint entry | `lib/endpoints.ts` — proxy allowlist **and** helper |

Server components fetch initial data and pass it as `initialData` to a client hook — this removes
the client waterfall and the loading flash. Keep `"use client"` at the leaves.

## Polling

Polling is deliberate, not default. Two rules learned the hard way:

- The run poll stops at `needs_review` (it is waiting for a human, not for the server).
- **Anything that arrives after that point needs its own poll.** Images are rendered by a background
  job after the run pauses; without a dedicated interval the URL lands in the database and the page
  never shows it. See `features/content/use-items.ts` — it polls only while an Instagram item lacks
  an image, and gives up after a bounded number of attempts so a failed render does not poll forever.

Any poll must have a stop condition. A poll with no exit is a leak.

## Styling

Design tokens only — `bg-warning`, `text-muted-foreground`, `border-border`. No raw hex, no
`dark:` overrides on individual components; both themes come from the token layer.

## Content rendering

Rendering is channel-aware and this is correctness, not cosmetics: blog text is markdown, social
posts are plain text. Passing a social post through markdown turns a leading hashtag line into an
H1 heading. See `components/common/post-body.tsx`.

## Verify

```bash
pnpm --filter @forteq/web typecheck
```

Never run `next build` while `next dev` is running — it overwrites `.next` and dev starts returning
500 with `React Client Manifest`, which looks exactly like an application bug. If it happens:
`rm -rf apps/web/.next` and restart dev.

Then load the actual page and confirm the change renders — typecheck does not prove a component
mounts.
