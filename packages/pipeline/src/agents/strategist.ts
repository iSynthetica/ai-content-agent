// Strategist (§7.2) — content plan. Два режими за наявністю s.planScope (розгалуження ВСЕРЕДИНІ ноди,
// топологія графа однакова):
//   ПОВНИЙ (planScope порожній): генерує N на канал (FR-3.2), формат під канал (FR-3.4),
//     дедуп тем across channels (FR-3.3), id = randomUUID() (код, не LLM).
//   СКОУПНУТИЙ (planScope заданий): мапінг PlanEntryInput→ContentPlanItem зі збереженням id===planEntry.id
//     (провенанс у слот plan_entries, §13); LLM лише для відсутніх format/keyMessage; повний skip
//     (0 LLM-викликів, cost=0), якщо всі keyMessage задані (format береться з дефолту каналу).
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { channelSchema, type Channel } from "@forteq/shared";
import type { ContentPlanItem } from "../schemas";
import { loadPrompt } from "../lib/loadPrompt";
import { fillTemplate } from "../lib/fillTemplate";
import { callStructured } from "../lib/llm";
import { slotModel } from "../config";
import type { GraphDeps } from "../ports";
import type { ContentStateT } from "../state";
import type { PlanEntryInput } from "../types";

// Дефолтний формат під канал (FR-3.4) — фолбек, коли LLM/скоуп не дали формат.
const DEFAULT_FORMATS: Record<Channel, string> = {
  linkedin: "thought-leadership post",
  twitter: "thread (3-5 tweets)",
  instagram: "visual caption post",
  blog: "long-form SEO article",
};

// LLM-вихід повного режиму: елементи БЕЗ id (id генерує код).
const PlanGenSchema = z.object({
  items: z
    .array(
      z.object({
        topic: z.string(),
        channel: channelSchema,
        format: z.string(),
        keyMessage: z.string(),
        seoKeywords: z.array(z.string()).default([]),
      }),
    )
    .default([]),
});

// LLM-вихід скоупнутого режиму: дозаповнення format/keyMessage за id.
const FillSchema = z.object({
  items: z
    .array(z.object({ id: z.string(), format: z.string(), keyMessage: z.string() }))
    .default([]),
});

// Нормалізація теми для дедупу (регістр/пробіли).
function normTopic(t: string): string {
  return t.trim().toLowerCase().replace(/\s+/g, " ");
}

// FR-3.3: унікальність тем across channels — лишаємо ПЕРШЕ входження, решту дублів прибираємо.
// Post-processing КОДОМ (не LLM). Експортується для unit-тесту.
export function deduplicateTopics<T extends { topic: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const it of items) {
    const key = normTopic(it.topic);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(it);
  }
  return out;
}

async function fullPlan(deps: GraphDeps, s: ContentStateT): Promise<Partial<ContentStateT>> {
  const modelId = slotModel(s.modelConfig, "strategist").model;
  const prompt = fillTemplate(loadPrompt("strategist.md"), {
    research: JSON.stringify(s.research ?? {}),
    channelConfig: JSON.stringify(s.channelConfig ?? {}),
    toneOfVoice: s.company.toneOfVoice ?? "professional",
    language: s.company.language,
    company: JSON.stringify({
      name: s.company.name,
      positioning: s.company.positioning,
      services: s.company.services,
      audience: s.company.audience,
    }),
  });

  const { parsed, cost } = await callStructured(
    deps.models.forAgent("strategist"),
    PlanGenSchema,
    prompt,
    modelId,
  );

  // id — код (randomUUID), НЕ LLM (§4). Формат — фолбек на дефолт каналу, якщо LLM не дав.
  const withIds: ContentPlanItem[] = parsed.items.map((it) => ({
    id: randomUUID(),
    topic: it.topic,
    channel: it.channel,
    format: it.format || DEFAULT_FORMATS[it.channel],
    keyMessage: it.keyMessage,
    seoKeywords: it.seoKeywords ?? [],
  }));

  const contentPlan = deduplicateTopics(withIds);
  deps.logger?.info({ node: "strategist", mode: "full", count: contentPlan.length }, "plan built");
  return { contentPlan, cost };
}

async function scopedPlan(deps: GraphDeps, s: ContentStateT): Promise<Partial<ContentStateT>> {
  const scope = (s.planScope ?? []) as PlanEntryInput[];
  const missing = scope.filter((e) => !e.keyMessage);

  // Повний skip: усі keyMessage задані людиною → 0 LLM-викликів, cost=0, format із дефолту каналу.
  if (missing.length === 0) {
    const contentPlan: ContentPlanItem[] = scope.map((e) => ({
      id: e.id, // провенанс: id === plan_entries.id
      topic: e.topic,
      channel: e.channel,
      format: DEFAULT_FORMATS[e.channel],
      keyMessage: e.keyMessage as string,
      seoKeywords: e.seoKeywords ?? [],
    }));
    deps.logger?.info({ node: "strategist", mode: "scoped", llmCalls: 0 }, "plan mapped (skip)");
    return { contentPlan, cost: { cents: 0, tokens: 0 } };
  }

  // Дозаповнення format/keyMessage лише для відсутніх — один компактний structured-виклик.
  const modelId = slotModel(s.modelConfig, "strategist").model;
  const prompt = fillTemplate(loadPrompt("strategist.md"), {
    research: JSON.stringify(s.research ?? {}),
    channelConfig: "{}",
    toneOfVoice: s.company.toneOfVoice ?? "professional",
    language: s.company.language,
    company: JSON.stringify({ scopedEntries: missing }),
  });

  const { parsed, cost } = await callStructured(
    deps.models.forAgent("strategist"),
    FillSchema,
    prompt,
    modelId,
  );

  const fillById = new Map(parsed.items.map((i) => [i.id, i]));
  const contentPlan: ContentPlanItem[] = scope.map((e) => {
    const fill = fillById.get(e.id);
    return {
      id: e.id, // тема ЗАФІКСОВАНА людиною — не перегенеровується, id зберігається
      topic: e.topic,
      channel: e.channel,
      format: fill?.format || DEFAULT_FORMATS[e.channel],
      keyMessage: e.keyMessage ?? fill?.keyMessage ?? "",
      seoKeywords: e.seoKeywords ?? [],
    };
  });
  deps.logger?.info(
    { node: "strategist", mode: "scoped", llmCalls: 1, count: contentPlan.length },
    "plan filled",
  );
  return { contentPlan, cost };
}

export const makeStrategistNode =
  (deps: GraphDeps) =>
  async (s: ContentStateT): Promise<Partial<ContentStateT>> =>
    s.planScope && s.planScope.length > 0 ? scopedPlan(deps, s) : fullPlan(deps, s);
