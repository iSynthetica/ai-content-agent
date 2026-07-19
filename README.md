# AI Content Agent

Мультиагентна платформа генерації контенту для IT-компаній. Монорепо (pnpm workspaces), TypeScript, Docker.

Архітектура і план — у `../agent-plan/architecture/` (context, api-contract, design-system, spike-1..3, roadmap).

## Структура

```
apps/
  web/        Next.js (UI + BFF-проксі → api)
  api/        Express (єдиний вхід до БД і пайплайна)
  worker/     BullMQ consumer (виконує LangGraph-граф)
packages/
  pipeline/   LangGraph.js: агенти, граф, стан, схеми
  evaluators/ rule-based + llm-judge
  db/         Drizzle schema + міграції (Postgres, RLS)
  shared/     Zod-контракти (api DTO + job-контракти) + config
```

## Швидкий старт (Фаза 0)

```bash
pnpm install
cp .env.example .env
pnpm docker:up            # postgres + redis + minio
pnpm db:generate          # згенерувати SQL-міграцію зі схеми
pnpm db:migrate           # застосувати
```

Тверда межа: `web` ходить у `api` лише по HTTP; прямого доступу до БД/пайплайна з `web` немає.
