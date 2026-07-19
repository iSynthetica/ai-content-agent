// AI-bootstrap профілю компанії (§6 раунд 2) — чернетка брифу з сайту або опису одним рядком.
//
// Навіщо: бриф — це 15 полів, і заповнювати їх вручну перед першою генерацією надто дорого для
// нового користувача. Тут ми їх ЧЕРНЕТИМО, щоб людині лишилось перевірити й виправити.
//
// ЧОМУ ТЕКСТ САЙТУ ПРИХОДИТЬ АРГУМЕНТОМ, А НЕ ЗАВАНТАЖУЄТЬСЯ ТУТ: завантаження сторінки —
// side effect, а пайплайн їх не робить (ADR-0004). Додавати окремий порт заради одного виклику
// надлишково, тож HTTP лишається у worker, а сюди приходить уже видобутий текст.
import { z } from "zod";
import { fillTemplate } from "./lib/fillTemplate";
import { loadPrompt } from "./lib/loadPrompt";
import { callStructured } from "./lib/llm";
import type { ModelFactory } from "./ports";
import type { RunCost } from "./state";

// Усі поля nullable, а не optional: OpenAI structured outputs у strict-режимі вимагає, щоб кожне
// поле було present (ADR-0004 / реальний баг, який давав нуль контенту).
const BrandProfileSchema = z.object({
  positioning: z.string().nullable(),
  stack: z.array(z.string()),
  services: z.array(z.string()),
  audience: z.string().nullable(),
  toneOfVoice: z.string().nullable(),
  visualStyle: z.string().nullable(),
  pillars: z.array(z.string()),
});

export type BrandProfileDraft = z.infer<typeof BrandProfileSchema>;

export interface DraftBrandProfileInput {
  name: string;
  /** Текст, видобутий зі сторінки компанії (worker). Порожній — якщо сайту немає або він не відкрився. */
  siteText?: string;
  /** Опис одним рядком від користувача. */
  description?: string;
  language: string;
  modelId: string;
}

/** Скільки тексту сайту віддаємо моделі. Далі йде навігація, футер і юридичні тексти — шум,
 *  який лише розмиває позиціювання і збільшує ціну виклику. */
const MAX_SITE_CHARS = 6000;

export class NotEnoughInputError extends Error {
  constructor() {
    super("draftBrandProfile: немає ні тексту сайту, ні опису — нема з чого робити чернетку");
    this.name = "NotEnoughInputError";
  }
}

/**
 * Чернетить бриф компанії. Усе, що повертається, — ЧЕРНЕТКА для правки людиною, а не факт.
 *
 * Якщо на вході нема ні тексту сайту, ні опису, кидаємо помилку замість виклику моделі: без
 * матеріалу вона вигадає позиціювання й послуги з назви компанії, і ця вигадка потрапить у бриф —
 * тобто в джерело правди для fact-check. Порожній бриф чесніший за правдоподібний вигаданий.
 */
export async function draftBrandProfile(
  deps: { models: ModelFactory },
  input: DraftBrandProfileInput,
): Promise<{ draft: BrandProfileDraft; cost: RunCost }> {
  const siteText = (input.siteText ?? "").trim().slice(0, MAX_SITE_CHARS);
  const description = (input.description ?? "").trim();

  if (!siteText && !description) throw new NotEnoughInputError();

  const prompt = fillTemplate(loadPrompt("onboarding-profile.md"), {
    name: input.name,
    siteText: siteText || "(сайт недоступний)",
    description: description || "(опис не надано)",
    language: input.language,
  });

  const { parsed, cost } = await callStructured(
    deps.models.forAgent("researcher"),
    BrandProfileSchema,
    prompt,
    input.modelId,
  );

  // Чистимо порожні рядки: модель регулярно віддає [""] замість [], і такий елемент потім
  // рендериться в UI як порожній чіп, який неможливо ні зрозуміти, ні видалити.
  const clean = (arr: string[]) => [...new Set(arr.map((s) => s.trim()).filter(Boolean))];

  return {
    draft: {
      positioning: parsed.positioning?.trim() || null,
      stack: clean(parsed.stack),
      services: clean(parsed.services),
      audience: parsed.audience?.trim() || null,
      toneOfVoice: parsed.toneOfVoice?.trim() || null,
      visualStyle: parsed.visualStyle?.trim() || null,
      pillars: clean(parsed.pillars),
    },
    cost,
  };
}
