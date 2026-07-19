// LangSmith-адаптери (§12.3 spike-1) — обгортки rule-based/judge у формат evaluate():
//   (run, example) => { key, score }. Типи run/example тримаємо структурними (generic), щоб пакет
// не залежав від langsmith-рантайму; реальний evaluate() передасть сумісні об'єкти.
import type { Channel } from "@forteq/shared";
import { runAllChecks, type RuleCheckInput } from "./ruleBased";
import { judgePost, type JudgePostArgs, type LlmJudgeModel } from "./llmJudge";

export interface EvaluatorResult {
  key: string;
  score: number;
}

// Мінімальні структурні типи (сумісні з langsmith Run/Example за потрібними полями).
export interface RunLike {
  outputs?: Record<string, unknown> | null;
}
export interface ExampleLike {
  inputs?: Record<string, unknown> | null;
  outputs?: Record<string, unknown> | null;
}

function pickText(obj: Record<string, unknown> | null | undefined, keys: string[]): string {
  if (!obj) return "";
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "string") return v;
  }
  return "";
}

// Rule-based агрегований евалюатор: середній score усіх перевірок (0..1).
export function ruleBasedEvaluator(channel: Channel) {
  return (run: RunLike, example?: ExampleLike): EvaluatorResult => {
    const text = pickText(run.outputs, ["text", "post", "content"]);
    const seoKeywords = (example?.inputs?.seoKeywords as string[] | undefined) ?? [];
    const input: RuleCheckInput = { channel, text, seoKeywords };
    const results = runAllChecks(input);
    const score = results.reduce((a, r) => a + r.score, 0) / (results.length || 1);
    return { key: "rule_based_avg", score };
  };
}

// LLM-judge евалюатор: нормалізований середній бал рубрики (1..5 → 0..1).
export function llmJudgeEvaluator(model: LlmJudgeModel, channel: Channel) {
  return async (run: RunLike, example?: ExampleLike): Promise<EvaluatorResult> => {
    const post = pickText(run.outputs, ["text", "post", "content"]);
    const brief = (example?.inputs?.brief as object | undefined) ?? {};
    const args: JudgePostArgs = { post, brief, channel };
    const judged = await judgePost(model, args);
    const vals = Object.values(judged.scores);
    const avg = vals.reduce((a, b) => a + b, 0) / (vals.length || 1);
    return { key: "llm_judge_avg", score: (avg - 1) / 4 };
  };
}
