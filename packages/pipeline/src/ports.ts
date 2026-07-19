// Порти (DI-контракти, §5 spike-1) — головна межа тестованості.
// Усе, що робить side-effect або коштує грошей (LLM, web search, image gen, персист, чекпоінт),
// заходить у пайплайн через ці інтерфейси. Пайплайн визначає лише контракт, не реалізацію.
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { BaseCheckpointSaver } from "@langchain/langgraph";
import type { AgentName, ModelConfig } from "./config";

// Побудова LLM per-agent. Тести інжектять фейк; worker — реальні клієнти.
export interface ModelFactory {
  forAgent(agent: AgentName): BaseChatModel;
  imageModel(): ImageModel; // для Visual
}

// Будівник ModelFactory per-run: приймає резолвлений ModelConfig, повертає готовий ModelFactory.
// Секрети замкнені всередині цієї функції у composition root worker'а — пайплайн їх не бачить.
export type ModelFactoryBuilder = (modelConfig: ModelConfig) => ModelFactory;

export interface ImageModel {
  generate(input: { prompt: string; size?: "1024x1024" }): Promise<{ bytes: Buffer; contentType: string }>;
}

export interface WebSearchHit {
  title: string;
  url: string;
  snippet: string;
}

// Researcher-інструмент. Реалізація (Tavily / OpenAI web_search) — у worker.
export interface WebSearchTool {
  search(query: string, opts?: { maxResults?: number }): Promise<WebSearchHit[]>;
}

// Персист згенерованих зображень. МВП — локальний том; продукт — MinIO/S3.
export interface ImageStore {
  put(
    bytes: Buffer,
    meta: { runId: string; draftId: string; contentType: string },
  ): Promise<{ url: string; key: string }>;
}

export interface Logger {
  info(o: object, m?: string): void;
  warn(o: object, m?: string): void;
  error(o: object, m?: string): void;
}

// Зовнішній контракт залежностей — те, що worker збирає у composition root ОДИН раз.
// models — БУДІВНИК (не готовий інстанс), бо ModelFactory залежить від per-run ModelConfig.
export interface PipelineDeps {
  models: ModelFactoryBuilder; // per-run: createPipeline викличе його з input.modelConfig
  webSearch: WebSearchTool;
  imageStore: ImageStore;
  checkpointer: BaseCheckpointSaver; // worker: PostgresSaver; тести: MemorySaver
  logger?: Logger;
}

// Внутрішні, вже РОЗВ'ЯЗАНІ per-run залежності, які бачать ноди графа й buildGraph.
// createPipeline будує їх зі PipelineDeps, викликавши models(modelConfig) перед invoke.
export interface GraphDeps extends Omit<PipelineDeps, "models"> {
  models: ModelFactory; // розв'язаний інстанс на цей прогін
}
