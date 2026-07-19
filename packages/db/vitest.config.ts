import { defineConfig } from "vitest/config";

// Тести цього пакета ВИМАГАЮТЬ живої БД (`pnpm docker:up`), тож вони не входять у `pnpm test`,
// а запускаються окремо: `pnpm --filter @forteq/db test:rls`. Мовчазний пропуск без інфраструктури
// був би гіршим за відсутність тесту — він створював би враження покриття.
export default defineConfig({
  test: {
    include: ["test/**/*.integration.test.ts"],
    environment: "node",
    testTimeout: 20_000,
  },
});
