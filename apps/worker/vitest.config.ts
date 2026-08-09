import { defineConfig } from "vitest/config";

// Офлайн-тести воркера: хендлери на фейкових db/tx і мок-адаптерах (без Postgres/Redis/мережі).
// Дзеркалить конфіг pipeline/api — той самий include-патерн і node-середовище.
export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
  },
});
