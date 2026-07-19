// Фейкова інфраструктура для офлайн-тестів (§14 spike-1): FakeModelFactory + фейкові порти.
// FakeModelFactory реалізує контракт ModelFactory: forAgent(a).withStructuredOutput(...).invoke(prompt)
// повертає задану відповідь + raw.usage_metadata (щоб cost був ненульовий). Записує кожен prompt у calls.
import type { AgentName } from "../../src/config";
import type { ImageStore, ModelFactory, WebSearchTool } from "../../src/ports";

// Відповідь агента: сталий об'єкт АБО функція від prompt (для розрізнення initial/revision у Writer'а).
export type Responder = unknown | ((input: string) => unknown);

// Порядок величин навмисно РЕАЛІСТИЧНИЙ: у промпт writer'а заходить бриф компанії + research,
// тож тисячі токенів — норма. Дрібні 120/60 давали на весь прогін <1 цента, і costCents
// округлювався в 0 (assertion на акумуляцію вартості тримався лише на фіксованій ціні картинки,
// а картинки поїхали з графа у job content.visuals).
const DEFAULT_USAGE = { input_tokens: 12_000, output_tokens: 4_000, total_tokens: 16_000 };

export class FakeModelFactory implements ModelFactory {
  // calls[agent] — усі prompt'и, що отримав агент (для asserts, напр. чи дійшов людський note до Writer'а).
  public readonly calls: Record<string, string[]> = {};

  constructor(
    private readonly responses: Partial<Record<AgentName, Responder>>,
    private readonly usage = DEFAULT_USAGE,
  ) {}

  forAgent(agent: AgentName) {
    const responder = this.responses[agent];
    const usage = this.usage;
    const record = (input: string) => {
      (this.calls[agent] ??= []).push(input);
    };
    const resolve = (input: string) =>
      typeof responder === "function" ? (responder as (i: string) => unknown)(input) : responder;

    const model = {
      withStructuredOutput(_schema: unknown, _config?: unknown) {
        return {
          async invoke(input: string) {
            record(input);
            return { parsed: resolve(input), raw: { usage_metadata: usage } };
          },
        };
      },
      async invoke(input: string) {
        record(input);
        return { content: JSON.stringify(resolve(input)) };
      },
    };
    // Тестовий фейк — структурно сумісний з BaseChatModel за використовуваними методами.
    return model as unknown as ReturnType<ModelFactory["forAgent"]>;
  }

  imageModel() {
    return {
      async generate() {
        return { bytes: Buffer.from("fake-image-bytes"), contentType: "image/png" };
      },
    };
  }
}

// Фейковий web search — сталі хіти (Researcher нода їх лише передає у промпт).
export const fakeWebSearch: WebSearchTool = {
  async search() {
    return [
      { title: "Trend 1", url: "https://example.com/a", snippet: "snippet a" },
      { title: "Trend 2", url: "https://example.com/b", snippet: "snippet b" },
    ];
  },
};

// Фейковий image store — повертає детермінований URL за draftId (байти не персистить).
export const fakeImageStore: ImageStore = {
  async put(_bytes, meta) {
    return { url: `mem://images/${meta.runId}/${meta.draftId}.png`, key: meta.draftId };
  },
};
