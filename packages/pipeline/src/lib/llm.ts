// Хелпер structured-виклику LLM з витягом вартості (§7 spike-1). Наскрізний контракт:
// includeRaw: true → invoke повертає { parsed, raw }, з raw.usage_metadata рахуємо cost.
// Без includeRaw вартість тихо писалась би як 0 — тому це єдина точка всіх structured-викликів нод.
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { z } from "zod";
import type { RunCost } from "../state";
import { costFromUsage, type UsageMetadata } from "./cost";

interface RawWithUsage {
  usage_metadata?: UsageMetadata;
}

// Обгортка над withStructuredOutput({ includeRaw: true }). Каст ізолює дрібні розбіжності сигнатур
// між версіями @langchain/core; parsed типізується як z.infer<S>, cost акумулюється з usage_metadata.
export async function callStructured<S extends z.ZodTypeAny>(
  model: BaseChatModel,
  schema: S,
  prompt: string,
  modelId: string,
): Promise<{ parsed: z.infer<S>; cost: RunCost }> {
  const runnable = model.withStructuredOutput(schema as never, { includeRaw: true }) as unknown as {
    invoke(input: string): Promise<{ parsed: z.infer<S>; raw: RawWithUsage }>;
  };
  const { parsed, raw } = await runnable.invoke(prompt);
  return { parsed, cost: costFromUsage(raw?.usage_metadata, modelId) };
}
