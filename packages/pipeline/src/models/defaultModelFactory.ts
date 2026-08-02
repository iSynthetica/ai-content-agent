// defaultModelFactory (§5, §6 spike-1) — ЕКСПОРТУЄТЬСЯ як зручність для worker (composition root).
// НЕ читає process.env: конфіг і секрети приходять аргументами (worker замикає секрети у будівнику:
//   const models: ModelFactoryBuilder = (mc) => defaultModelFactory(mc, secrets)).
// DI не порушено — worker сам вирішує, що інжектити; тести інжектять FakeModelFactory (той самий контракт).
import { ChatOpenAI } from "@langchain/openai";
import { ChatAnthropic } from "@langchain/anthropic";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { AgentName, ModelConfig, ModelSecrets } from "../config";
import type { ImageModel, ModelFactory } from "../ports";

export function defaultModelFactory(config: ModelConfig, secrets: ModelSecrets): ModelFactory {
  const buildChat = (modelId: string): BaseChatModel => {
    if (config.provider === "anthropic") {
      return new ChatAnthropic({ model: modelId, apiKey: secrets.anthropicApiKey, temperature: 0.7 });
    }
    if (config.provider === "gemini") {
      // Gemini structured-output йде через function-calling (не strict-JSON як OpenAI), тож
      // .withStructuredOutput у агентах працює, але поведінка інша — потребує перевірки живим ключем.
      return new ChatGoogleGenerativeAI({ model: modelId, apiKey: secrets.geminiApiKey, temperature: 0.7 });
    }
    // GPT-5-família та o-series — reasoning-моделі: (1) приймають ЛИШЕ дефолтну temperature (1),
    // кастомна → 400; (2) БЕЗ reasoning_effort «думають» задовго (десятки секунд навіть на дрібних
    // задачах). Контент-генерація не потребує глибокого reasoning → ставимо effort "minimal" (швидко).
    // Для gpt-4.x / 4o (не reasoning) лишаємо temperature 0.7.
    const isReasoning = /^(gpt-5|o[0-9])/i.test(modelId);
    return new ChatOpenAI({
      model: modelId,
      apiKey: secrets.openaiApiKey,
      // reasoning_effort передаємо СИРИМ через modelKwargs (типізований reasoningEffort не завжди
      // мапиться на chat-completions endpoint) — "minimal" різко скорочує «думання» на gpt-5/o.
      ...(isReasoning
        ? { modelKwargs: { reasoning_effort: "minimal" } }
        : { temperature: 0.7 }),
    });
  };

  return {
    forAgent(agent: AgentName): BaseChatModel {
      return buildChat(config.models[agent]);
    },
    imageModel(): ImageModel {
      // МВП: OpenAI Images API через fetch (без окремої залежності). Ключ замкнено в секретах.
      return makeOpenAIImageModel(config.models.visual, secrets.openaiApiKey);
    },
  };
}

function makeOpenAIImageModel(modelId: string, apiKey: string | undefined): ImageModel {
  return {
    async generate({ prompt, size }) {
      const res = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey ?? ""}`,
        },
        body: JSON.stringify({ model: modelId, prompt, size: size ?? "1024x1024", n: 1 }),
      });
      if (!res.ok) {
        throw new Error(`image generation failed: ${res.status} ${await res.text()}`);
      }
      const data = (await res.json()) as { data?: Array<{ b64_json?: string }> };
      const b64 = data.data?.[0]?.b64_json;
      if (!b64) throw new Error("image generation: no b64_json in response");
      return { bytes: Buffer.from(b64, "base64"), contentType: "image/png" };
    },
  };
}
