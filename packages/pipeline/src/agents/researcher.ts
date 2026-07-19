// Researcher (§7.1) — web search → структурований контекст (теми ніші, болі аудиторії, джерела).
// Порт: WebSearchTool. Вихід: withStructuredOutput(ResearchResultSchema) — агреговані висновки (FR-2.3),
// з URL джерел (FR-2.4). Санітизація sources КОДОМ (не hard-fail): кривий URL деградує список, а не валить run.
import { ResearchResultSchema, type ResearchResult } from "../schemas";
import { loadPrompt } from "../lib/loadPrompt";
import { fillTemplate } from "../lib/fillTemplate";
import { callStructured } from "../lib/llm";
import type { GraphDeps } from "../ports";
import type { ContentStateT } from "../state";
import type { CompanyContext } from "../types";

// Пошуковий запит з brief'у: ніша/аудиторія/послуги.
function buildQuery(c: CompanyContext): string {
  const parts = [c.name, c.positioning, c.audience, ...(c.services ?? [])].filter(Boolean);
  return `${parts.join(" ")} IT services niche trends audience pain points competitors`;
}

// Валідний http(s) URL — інакше тихо відкидаємо (санітизація §7.1).
function isHttpUrl(s: string): boolean {
  try {
    const u = new URL(s);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export const makeResearcherNode =
  (deps: GraphDeps) =>
  async (s: ContentStateT): Promise<Partial<ContentStateT>> => {
    const modelId = s.modelConfig.models.researcher;
    const hits = await deps.webSearch.search(buildQuery(s.company), { maxResults: 8 });

    const prompt = fillTemplate(loadPrompt("researcher.md"), {
      company: JSON.stringify(s.company),
      sources: JSON.stringify(hits),
      language: s.company.language,
    });

    // includeRaw: true всередині callStructured → usage_metadata доступний для cost.
    const { parsed, cost } = await callStructured(
      deps.models.forAgent("researcher"),
      ResearchResultSchema,
      prompt,
      modelId,
    );

    // Санітизація джерел кодом (не .url() у Zod — щоб один кривий рядок не завалив увесь дорогий крок).
    const research: ResearchResult = {
      ...parsed,
      sources: (parsed.sources ?? []).filter(isHttpUrl),
    };

    deps.logger?.info(
      { node: "researcher", topics: research.nicheTopics.length, sources: research.sources.length },
      "research done",
    );
    return { research, cost };
  };
