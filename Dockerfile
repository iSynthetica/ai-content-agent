# Один Dockerfile на три застосунки (цілі api / worker / web).
#
# Чому не три файли: у pnpm-монорепо крок установки залежностей однаковий і найдорожчий. Спільний
# базовий шар збирається раз і перевикористовується всіма трьома образами; три окремі файли
# означали б три однакові `pnpm install` і потрійний час збірки.

# ── base ─────────────────────────────────────────────────────────────────────
FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /app

# ── deps ─────────────────────────────────────────────────────────────────────
# Спершу КОПІЮЄМО ЛИШЕ МАНІФЕСТИ, потім ставимо залежності. Зміна вихідного коду не інвалідує
# цей шар — інакше кожна правка одного рядка перевстановлювала б увесь workspace.
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json      apps/api/
COPY apps/web/package.json      apps/web/
COPY apps/worker/package.json   apps/worker/
COPY packages/db/package.json         packages/db/
COPY packages/shared/package.json     packages/shared/
COPY packages/pipeline/package.json   packages/pipeline/
COPY packages/evaluators/package.json packages/evaluators/
# --ignore-scripts: husky-хук `prepare` у контейнері не потрібен і без .git падає.
RUN pnpm install --frozen-lockfile --ignore-scripts

# ── source ───────────────────────────────────────────────────────────────────
FROM deps AS source
COPY tsconfig.base.json ./
COPY packages/ packages/
COPY apps/ apps/

# ── api ──────────────────────────────────────────────────────────────────────
# api і worker виконують TypeScript напряму через tsx — так само, як у розробці. Окремий крок
# збірки дав би швидший старт, але й другий спосіб запуску, який довелося б тримати в синхроні.
# Для МВП однаковість важливіша.
FROM source AS api
ENV NODE_ENV=production
EXPOSE 4000
CMD ["pnpm", "--filter", "@forteq/api", "start"]

# ── worker ───────────────────────────────────────────────────────────────────
FROM source AS worker
ENV NODE_ENV=production
# Тека для згенерованих зображень; у compose підмонтована як том, щоб вони переживали рестарт.
RUN mkdir -p /data/images
CMD ["pnpm", "--filter", "@forteq/worker", "start"]

# ── web ──────────────────────────────────────────────────────────────────────
# Next збирається на етапі образу. NEXT_PUBLIC_* вшиваються у бандл під час build, тож вони
# приходять як build-arg, а не тільки як env рантайму — інакше у браузер поїхало б undefined.
FROM source AS web-build
ARG NEXT_PUBLIC_APP_URL=http://localhost:3000
ENV NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL}
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter @forteq/web build

FROM web-build AS web
ENV NODE_ENV=production
EXPOSE 3000
CMD ["pnpm", "--filter", "@forteq/web", "start"]
