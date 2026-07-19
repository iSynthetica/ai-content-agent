// Фейковий ModelFactory (spike-1 §14) — детерміновані відповіді агентів БЕЗ мережі/ключів.
// Використовується composition root, коли FAKE_MODELS=1 або немає жодного LLM-ключа, щоб
// end-to-end плумбінг worker→pipeline→checkpointer→БД перевірявся без реальних LLM-викликів.
// Контракт дзеркалить тестовий FakeModelFactory пайплайна: forAgent(a).withStructuredOutput(...)
// .invoke(prompt) → { parsed, raw.usage_metadata } (щоб cost був ненульовий).
import type { AgentName, ModelFactory } from "@forteq/pipeline";

// Ненульовий usage → cost акумулюється (§7 spike-1), як у реальному прогоні.
const USAGE = { input_tokens: 100, output_tokens: 50, total_tokens: 150 };

// Researcher → ResearchResult (nicheTopics ≥5, audiencePains ≥3, валідні http-джерела).
const RESEARCH = {
  companyContext: "Forteq будує надійні B2B-рішення для середнього бізнесу.",
  nicheTopics: ["інтеграції", "легасі-міграції", "DevOps", "TypeScript", "архітектура", "API"],
  audiencePains: ["довгий time-to-market", "технічний борг", "нестача інженерів"],
  competitorPatterns: [],
  sources: ["https://example.com/a", "https://example.com/b"],
};

// Strategist (повний режим) → PlanGenSchema { items[] } без id (id генерує код у ноді).
// 1 linkedin + 1 instagram: instagram вмикає гілку Visual (conditional edge) — перевіряємо її теж.
const PLAN = {
  items: [
    { topic: "Як скоротити time-to-market", channel: "linkedin", format: "post", keyMessage: "швидше", seoKeywords: ["ttm"] },
    { topic: "Візуальний сторітелінг бренду", channel: "instagram", format: "caption", keyMessage: "візуал", seoKeywords: [] },
  ],
};

// Writer → DraftBodySchema { text, imagePromptSuggestion?, metaDescription? }.
// Розрізняє ревізію за маркером "РЕВІЗІЯ" (з writer-revision.md), як тестовий фейк.
const writerResponder = (prompt: string) =>
  prompt.includes("РЕВІЗІЯ")
    ? { text: "REVISED: оновлений текст поста.", imagePromptSuggestion: "clean office desk", metaDescription: "d" }
    : { text: "Початковий текст згенерованого поста.", imagePromptSuggestion: "clean office desk", metaDescription: "d" };

// Reviewer → ReviewResultSchema. Усі критерії ≥4 + factCheck pass → determineStatus() = "approved",
// тож граф доходить до humanReviewGate й стає на interrupt (needs_review) — очікуваний шлях smoke.
const REVIEW_APPROVED = {
  draftId: "",
  scores: {
    toneAlignment: { score: 5, why: "тон точно відповідає бренду й аудиторії загалом добре" },
    specificity: { score: 4, why: "достатньо конкретики з деталями під канал загалом добре" },
    factualCoherence: { score: 5, why: "узгоджено з фактами brief без вигадок цілком зовсім" },
    channelFit: { score: 4, why: "формат відповідає нормам каналу цілком добре нині так" },
  },
  factCheck: { companyFactsInPost: [], factsInBrief: [], violations: [], verdict: "pass" },
  hedgingIssues: [],
  violations: [],
  status: "approved",
};

type Responder = unknown | ((prompt: string) => unknown);

const RESPONSES: Record<AgentName, Responder> = {
  researcher: RESEARCH,
  strategist: PLAN,
  writer: writerResponder,
  reviewer: REVIEW_APPROVED,
};

// Опції фейкової фабрики. stepDelayMs — штучна затримка на кожен fake-виклик моделі (§progress),
// щоб per-node прогрес було видно наживо. Дефолт 700мс (узгоджено з FAKE_STEP_DELAY_MS у env).
export interface FakeModelFactoryOptions {
  stepDelayMs?: number;
}

const sleep = (ms: number): Promise<void> =>
  ms > 0 ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve();

export function createFakeModelFactory(opts: FakeModelFactoryOptions = {}): ModelFactory {
  const stepDelayMs = opts.stepDelayMs ?? 700;
  return {
    forAgent(agent: AgentName) {
      const responder = RESPONSES[agent];
      const resolve = (prompt: string): unknown =>
        typeof responder === "function" ? (responder as (p: string) => unknown)(prompt) : responder;

      const model = {
        withStructuredOutput(_schema: unknown, _config?: unknown) {
          return {
            async invoke(prompt: string) {
              await sleep(stepDelayMs); // демо-затримка: нода помітно «висить» → прогрес видно наживо
              return { parsed: resolve(prompt), raw: { usage_metadata: USAGE } };
            },
          };
        },
        async invoke(prompt: string) {
          await sleep(stepDelayMs);
          return { content: JSON.stringify(resolve(prompt)) };
        },
      };
      // Структурно сумісний з BaseChatModel за використовуваними ноду методами.
      return model as unknown as ReturnType<ModelFactory["forAgent"]>;
    },
    imageModel() {
      return {
        async generate() {
          await sleep(stepDelayMs); // затримка й на Visual-ноду (image gen)
          return { bytes: Buffer.from("fake-image-bytes"), contentType: "image/png" };
        },
      };
    },
  };
}
