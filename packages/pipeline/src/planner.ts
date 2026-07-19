// Підбір тем для слотів контент-плану (§5 раунд 2).
//
// ЧОМУ ЦЕ НЕ ВУЗОЛ ГРАФА: планування відокремлене від генерації. Тема обирається наперед, у слоті,
// і живе там доти, доки людина її не погодить; генерація стартує окремо і вже з готовою темою.
// Змішати їх означало б втратити можливість переглянути план до того, як витрачені гроші на LLM.
//
// Як і renderVisuals, це самостійна функція за портами, а не нода: її кличе окрема job.
import { z } from "zod";
import type { Channel } from "@forteq/shared";
import { fillTemplate } from "./lib/fillTemplate";
import { loadPrompt } from "./lib/loadPrompt";
import { callStructured } from "./lib/llm";
import type { CompanyContext } from "./types";
import type { ModelFactory } from "./ports";
import type { RunCost } from "./state";

// Слот, який потребує теми. `date` потрібен моделі як контекст сезонності/послідовності.
export interface TopicSlot {
  id: string;
  channel: Channel;
  date: string | null;
}

export interface SuggestedTopic {
  id: string;
  topic: string;
  keyMessage: string;
  seoKeywords: string[];
  pillar: string | null;
}

// Вихід LLM. `id` повертається моделлю, щоб зіставити тему зі слотом; усе, що не зіставилось,
// відкидається кодом — модель не може вигадати слот, якого ми не просили.
const SuggestionSchema = z.object({
  suggestions: z.array(
    z.object({
      id: z.string(),
      topic: z.string(),
      keyMessage: z.string(),
      seoKeywords: z.array(z.string()),
      pillar: z.string().nullable(),
    }),
  ),
});

function normTopic(t: string): string {
  return t.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Пропонує теми для порожніх слотів.
 *
 * Дедуп двоступеневий і робиться КОДОМ, а не проханням у промпті:
 *   1. проти вже наявних у плані тем (`existingTopics`) — щоб місяць не складався з варіацій
 *      однієї думки;
 *   2. усередині відповіді — модель регулярно повторює тему для різних каналів.
 * Слот, для якого теми не лишилось, просто не отримує її: краще порожній слот, який видно
 * в UI, ніж дубль, який людина помітить лише після генерації.
 */
export async function suggestTopics(
  deps: { models: ModelFactory },
  input: {
    company: CompanyContext;
    pillars: string[];
    slots: readonly TopicSlot[];
    existingTopics: readonly string[];
    modelId: string;
  },
): Promise<{
  suggestions: SuggestedTopic[];
  cost: RunCost;
  /**
   * Скільки пропозицій модель заявила і чому решта відпала. Повертається НАВМИСНО: «модель дала
   * одну тему» і «дедуп відкинув три» ззовні виглядають однаково — як 1 заповнений слот, — а це
   * протилежні діагнози (перше лікується промптом, друге нормальне). Без цих лічильників тиха
   * фільтрація маскується під результат.
   */
  stats: { claimed: number; unknownId: number; duplicate: number; empty: number };
}> {
  if (input.slots.length === 0) {
    return {
      suggestions: [],
      cost: { cents: 0, tokens: 0 },
      stats: { claimed: 0, unknownId: 0, duplicate: 0, empty: 0 },
    };
  }

  const prompt = fillTemplate(loadPrompt("planner-topics.md"), {
    company: JSON.stringify(input.company),
    pillars: JSON.stringify(input.pillars),
    slots: JSON.stringify(input.slots),
    existingTopics: JSON.stringify(input.existingTopics),
    language: input.company.language,
  });

  const { parsed, cost } = await callStructured(
    deps.models.forAgent("strategist"),
    SuggestionSchema,
    prompt,
    input.modelId,
  );

  const wanted = new Map(input.slots.map((s) => [s.id, s]));
  const seen = new Set(input.existingTopics.map(normTopic));
  const out: SuggestedTopic[] = [];
  const stats = { claimed: parsed.suggestions.length, unknownId: 0, duplicate: 0, empty: 0 };

  for (const s of parsed.suggestions) {
    if (!wanted.has(s.id)) {
      stats.unknownId++; // тема для слота, якого ми не просили (або вже заповненого)
      continue;
    }
    if (!s.topic.trim()) {
      stats.empty++;
      continue;
    }
    const key = normTopic(s.topic);
    if (seen.has(key)) {
      stats.duplicate++; // дубль проти плану або проти попередньої пропозиції
      continue;
    }
    seen.add(key);
    wanted.delete(s.id); // один слот — одна тема
    out.push({
      id: s.id,
      topic: s.topic.trim(),
      keyMessage: s.keyMessage.trim(),
      seoKeywords: s.seoKeywords.filter((k) => k.trim().length > 0),
      pillar: s.pillar,
    });
  }

  return { suggestions: out, cost, stats };
}
