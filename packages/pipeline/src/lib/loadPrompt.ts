// loadPrompt (§2.1, §6 spike-1) — синхронне читання .md з ../prompts від import.meta.url з кешем.
// У dev/vitest (запуск із src) шлях резолвиться у src/prompts; після білду — у dist/prompts
// (build-крок копіює src/prompts → dist/prompts, див. package.json "build"). Той самий код в обох режимах.
import { readFileSync } from "node:fs";

const cache = new Map<string, string>();

export function loadPrompt(name: string): string {
  const cached = cache.get(name);
  if (cached !== undefined) return cached;
  // new URL(..., import.meta.url) — крос-платформний резолв відносно поточного модуля.
  const url = new URL(`../prompts/${name}`, import.meta.url);
  const text = readFileSync(url, "utf-8");
  cache.set(name, text);
  return text;
}

// Тестова утиліта: скинути кеш (напр., щоб перечитати промпт у тесті). У рантаймі не викликається.
export function clearPromptCache(): void {
  cache.clear();
}
