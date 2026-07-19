# Contributing

Conventions for working in this repository. The architectural rules live in `CLAUDE.md` and
`docs/adr/`; this file covers process — branches, commits, and what "done" means.

## Branches

```
<type>/<short-kebab-description>
```

`type` matches the commit types below. Keep the description short and specific — the branch name is
read in a list, not in isolation.

```
feat/markdown-export
fix/rls-nullif-pooled-connections
perf/parallel-post-generation
docs/adr-image-generation
chore/dockerfiles
```

Never commit directly to `main`.

## Commits

[Conventional Commits](https://www.conventionalcommits.org/). Every commit in this repository
follows it — keep it that way.

```
<type>(<scope>): <subject>

<body — why, not what>
```

### Types

| Type | Use for |
|---|---|
| `feat` | new user-visible capability |
| `fix` | bug fix |
| `perf` | performance change with no behaviour change |
| `refactor` | restructuring with no behaviour change |
| `test` | tests only |
| `docs` | documentation only |
| `chore` | tooling, config, dependencies, migrations that carry no product change |
| `build` / `ci` | build pipeline and CI |

### Scopes

Prefer the package or app the change belongs to:

`web` · `api` · `worker` · `pipeline` · `db` · `shared` · `evaluators` · `infra`

Use a **feature scope** instead when the change deliberately spans several packages, because that is
the more useful unit for a reader: `notifications`, `export`, `runs`, `reviewer`.

Omit the scope only when the change is genuinely repository-wide.

### Subject

Imperative mood, lowercase, no trailing period, under ~72 characters.

```
feat(export): вивантаження пакета у Markdown і JSON
fix(db): NULLIF у RLS — GUC порожніє на пулених з'єднаннях
```

### Body

The subject says *what*. The body must say **why**, and what breaks if it is done the obvious way
instead. This is the part a reader needs in six months, and it is the part that is impossible to
reconstruct later.

Good bodies from this history:

```
fix(db): NULLIF у RLS — GUC порожніє на пулених з'єднаннях

current_setting повертає порожній рядок замість NULL після повернення
з'єднання в пул, і приведення ''::uuid валило КОЖЕН запит під RLS.
```

```
perf(pipeline): генерація картинок поза критичним шляхом

Одна картинка gpt-image-1 ≈ 40с, і поки вона малювалась у графі, людина не
могла прочитати ТЕКСТ — а саме текст їй потрібен для рецензії.

Час до рецензії: 64с → 20с.
```

Include measurements when the change is about performance, and name the failure mode when the change
is a fix.

### Trailers

`Co-Authored-By` is for **real people who worked on the change**. Do not add tool or assistant
attribution — it makes authorship harder to read for no benefit.

### Language

**Commit messages are written in English**, together with all documentation inside the repository
(`README.md`, `CLAUDE.md`, `CONTRIBUTING.md`, `docs/adr/`, `.claude/skills/`).

Code comments remain in Ukrainian — match the surrounding file.

## Automated enforcement

Two git hooks (husky) run locally. They are installed by `pnpm install` via the `prepare` script —
no manual setup.

| Hook | What it does | Cost |
|---|---|---|
| `commit-msg` | commitlint against `commitlint.config.js` — types, scopes, formatting | instant |
| `pre-push` | `pnpm -r typecheck` and `pnpm -r test` | ~40s |

`commitlint.config.js` encodes the types and scopes documented above. **Adding a scope here means
adding it there too**, otherwise the document and the hook drift apart.

Subject casing is a **warning, not an error**: case rules assume Latin prose, and subjects here
legitimately start with acronyms (`RLS-політики`, `NULLIF у RLS`, `ADR-записи`). Enforced as an
error it rejected 5 of the first 38 commits, all correctly written.

Bypass deliberately when you mean it — a WIP branch you are about to rebase:

```bash
git commit --no-verify
git push --no-verify
```

Bypassing to avoid fixing a real failure is how a broken `main` happens.

## Before you push

```bash
pnpm -r typecheck
pnpm -r test
```

Both must be green. Beyond that, **exercise the change**: typecheck and unit tests do not prove the
system works, and most failures in this project have been runtime behaviour that compiled perfectly.
The `verify` skill has the procedure for driving a real run.

A change that touches generation, the queue, or the review flow is not done until it has been run
end to end.

## Pull requests

- One logical change per PR. If the description needs "and", consider splitting it.
- The description states the problem and why this solution, not a file-by-file summary — the diff
  already shows that.
- Note anything you could **not** verify. Silence reads as "verified", which is worse than an
  honest gap.
- Self-review the diff first. The `review` skill contains the project checklist: boundaries, RLS and
  transaction scope, silent-failure patterns, contract drift.

## When a change needs an ADR

Write one in `docs/adr/` if the change:

- alters an architectural boundary or introduces a new one,
- reverses or supersedes a recorded decision,
- picks between real alternatives with lasting consequences,
- exists because an obvious approach was tried and failed — that reasoning is the most valuable
  thing to record, and the easiest to lose.

Copy `docs/adr/template.md`, take the next number, add it to the index. ADRs are immutable: to change
a decision, write a new record and mark the old one superseded.

## Definition of done

- [ ] `pnpm -r typecheck` and `pnpm -r test` pass
- [ ] Behaviour verified by running it, not only by compiling it
- [ ] No secrets in the diff (`.env` is gitignored — keep it that way)
- [ ] New tenant table has an RLS policy
- [ ] New endpoint is in the web proxy allowlist
- [ ] Non-obvious decisions are explained in a comment or an ADR
