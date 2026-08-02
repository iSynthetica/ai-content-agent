import { defineConfig } from "vitest/config";

// Офлайн-тести пакета db (без БД): напр. симетричне шифрування BYOK. Тримаються ОКРЕМО від
// rls.integration (той вимагає живої БД), щоб `pnpm test` не мовчки пропускав крипто через
// відсутність Postgres. Інтеграційні файли (*.integration.test.ts) сюди свідомо не входять.
export default defineConfig({
  test: {
    include: ["test/**/*.unit.test.ts"],
    environment: "node",
  },
});
