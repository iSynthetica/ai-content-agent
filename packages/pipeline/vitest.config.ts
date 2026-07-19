import { defineConfig } from "vitest/config";

// Офлайн-тести пайплайна (§14): unit на нодах/reducer'ах/routing + integration interrupt/resume
// на MemorySaver і фейкових моделях. Мережа/БД не потрібні.
export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
  },
});
