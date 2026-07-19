import { defineConfig } from "vitest/config";

// Офлайн-тести api: чисті модулі (серіалізація експорту, мапінги) без БД, Express і мережі.
// Шар сервісів/репозиторіїв поки не покритий — це усвідомлена межа першого кроку.
export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
  },
});
