// Layer 2 — LLM-суддя (§12.2 spike-1). ОКРЕМИЙ від Reviewer: офлайн-інструмент калібровки та
// LangSmith evaluate(), у рантайм-шлях worker'а НЕ входить. Та сама рубрика 4 критерії, сильніша модель.
import { z } from "zod";
import type { Channel } from "@forteq/shared";

export const JudgeResultSchema = z.object({
  scores: z.object({
    toneAlignment: z.number().int().min(1).max(5),
    specificity: z.number().int().min(1).max(5),
    factualCoherence: z.number().int().min(1).max(5),
    channelFit: z.number().int().min(1).max(5),
  }),
  rationale: z.string(),
  verdict: z.enum(["pass", "fail"]),
});
export type JudgeResult = z.infer<typeof JudgeResultSchema>;

// Мінімальний структурний тип моделі — щоб @forteq/evaluators не тягнув @langchain/core як залежність.
// Реальний BaseChatModel структурно збігається (має withStructuredOutput + invoke).
export interface LlmJudgeModel {
  withStructuredOutput?: (
    schema: unknown,
    config?: unknown,
  ) => { invoke(input: unknown): Promise<unknown> };
  invoke(input: unknown): Promise<unknown>;
}

export interface JudgePostArgs {
  post: string;
  brief: object;
  channel: Channel;
}

function buildJudgePrompt(args: JudgePostArgs): string {
  return [
    "Ти — незалежний LLM-суддя якості контенту. Оціни пост за рубрикою 4 критеріїв (1–5):",
    "toneAlignment, specificity, factualCoherence, channelFit.",
    `Канал: ${args.channel}`,
    `Brief (джерело правди для факт-чеку): ${JSON.stringify(args.brief)}`,
    "Пост:",
    args.post,
    "",
    "Verdict = 'fail', якщо є вигадані/суперечливі факти відносно brief; інакше 'pass'.",
    "У 'rationale' коротко поясни бали.",
  ].join("\n");
}

// judgePost — структурований суддя. Якщо модель підтримує withStructuredOutput — використовуємо його;
// інакше парсимо JSON із текстової відповіді. Результат завжди валідуємо JudgeResultSchema.
export async function judgePost(model: LlmJudgeModel, args: JudgePostArgs): Promise<JudgeResult> {
  const prompt = buildJudgePrompt(args);

  if (typeof model.withStructuredOutput === "function") {
    const structured = model.withStructuredOutput(JudgeResultSchema);
    const raw = await structured.invoke(prompt);
    return JudgeResultSchema.parse(raw);
  }

  const raw = await model.invoke(prompt);
  const text = extractText(raw);
  return JudgeResultSchema.parse(JSON.parse(text));
}

// Витяг тексту з відповіді моделі (AIMessage.content | string | { content }).
function extractText(raw: unknown): string {
  if (typeof raw === "string") return raw;
  if (raw && typeof raw === "object" && "content" in raw) {
    const c = (raw as { content: unknown }).content;
    if (typeof c === "string") return c;
  }
  return JSON.stringify(raw);
}
