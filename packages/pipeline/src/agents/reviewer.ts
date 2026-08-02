// Reviewer (§7.5) — quality gate. Режим виводиться ЗІ СТАНУ (БЕЗ mode-параметра, нода досяжна
// з двох шляхів): s.final.length === 0 ⇒ initial (рев'ю усіх s.drafts); інакше ⇒ revision
// (лише s.drafts з id серед needs_revision у s.final). Емітить final[] тільки для рев'юнутих —
// mergeFinalById домердж за id зберігає раніше approved (економія токенів + збереження даних).
// Рубрика 4 критерії + fact-check (Type 1, NLI) + hedging (rule-based з @forteq/evaluators, Type 3) + determineStatus.
import { forbiddenCategorical, hedgingCheck } from "@forteq/evaluators";
import { ReviewResultSchema } from "../schemas";
import type { DraftItem, FinalItem, ReviewResult, Violation } from "../schemas";
import { loadPrompt } from "../lib/loadPrompt";
import { fillTemplate } from "../lib/fillTemplate";
import { callStructured } from "../lib/llm";
import { mapPool } from "../lib/mapPool";
import { ITEM_CONCURRENCY, slotModel } from "../config";
import { addCost } from "../state";
import type { ContentStateT, RunCost } from "../state";
import type { GraphDeps } from "../ports";

type Scores = ReviewResult["scores"];

// Середній бал за 4 критеріями (використовується в determineStatus і у payload interrupt'а).
export function averageScore(scores: Scores): number {
  const vals = [
    scores.toneAlignment.score,
    scores.specificity.score,
    scores.factualCoherence.score,
    scores.channelFit.score,
  ];
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

// determineStatus (§7.5) — детермінований КОДОМ (не з LLM-статусу), щоб gate був передбачуваним:
//   fail fact-check → flagged; будь-який критерій<2 → flagged; avg<3 → needs_revision; інакше approved.
export function determineStatus(
  scores: Scores,
  factCheck: ReviewResult["factCheck"],
): ReviewResult["status"] {
  if (factCheck.verdict === "fail") return "flagged";
  if (Object.values(scores).some((c) => c.score < 2)) return "flagged";
  if (averageScore(scores) < 3) return "needs_revision";
  return "approved";
}

// Нормалізація для звірки цитати: модель майже завжди трохи змінює регістр/пробіли/тире,
// тому порівнюємо «пом'якшено», але БЕЗ втрати змісту (слова лишаються ті самі).
function normalizeForMatch(t: string): string {
  return t
    .toLowerCase()
    .replace(/[‐-―−]/g, "-") // різновиди тире → дефіс
    .replace(/[«»"'`‘’“”]/g, "") // лапки геть
    .replace(/\s+/g, " ")
    .trim();
}

// Мінімальна довжина цитати: коротші фрагменти («ми», «і») трапляються в будь-якому тексті
// випадково і не доводять, що модель справді щось знайшла.
const MIN_QUOTE_LEN = 4;

// Виняток для цифр: «40%», «2x», «99» коротші за поріг, але саме ВИГАДАНІ ЧИСЛА — найцінніший
// клас порушень для fact-check (§7.5, Type 1). Відкидати їх за довжиною означало б глушити
// рівно те, заради чого перевірка існує.
const hasDigit = (q: string): boolean => /\d/.test(q);

/**
 * ГОЛОВНИЙ запобіжник якості (див. коментар до ViolationSchema): лишаємо тільки ті порушення,
 * чия цитата РЕАЛЬНО присутня у тексті поста.
 *
 * Чому саме так, а не «попросити модель повертати []»: інструкція в промпті — це прохання, яке
 * слабка модель (дефолт gpt-5-nano) регулярно ігнорує, і у violations їхали «none», «-» та
 * описи відсутності. Блокліст фраз теж не годиться: справжнє порушення часто формулюється через
 * заперечення («немає джерела для цифри 40%»), і його б відкинуло разом зі сміттям. Звірка з
 * текстом натомість детермінована й не залежить від мови: описати відсутність можна, а
 * процитувати її — ні.
 */
export function groundViolations(items: readonly Violation[], text: string): Violation[] {
  const haystack = normalizeForMatch(text);
  return items.filter((v) => {
    const q = normalizeForMatch(v.quote ?? "");
    if (!q || !haystack.includes(q)) return false;
    return q.length >= MIN_QUOTE_LEN || hasDigit(q);
  });
}

// Дедуп за парою (цитата, суть) — LLM любить повторити те саме у fact-check і в hedging.
export function dedupeViolations(items: readonly Violation[]): Violation[] {
  const seen = new Set<string>();
  const out: Violation[] = [];
  for (const v of items) {
    const key = `${normalizeForMatch(v.quote)}|${normalizeForMatch(v.issue)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(v);
  }
  return out;
}

async function reviewOne(
  deps: GraphDeps,
  s: ContentStateT,
  draft: DraftItem,
): Promise<{ final: FinalItem; cost: RunCost }> {
  const modelId = slotModel(s.modelConfig, "reviewer").model;

  // Layer 1 rule-based pre-check (Type 3): hedging + forbidden categorical (з @forteq/evaluators,
  // без дублювання логіки). Прапорці підмішуємо у промпт як контекст для LLM-критеріїв.
  const hedge = hedgingCheck({ channel: draft.channel, text: draft.text });
  const cat = forbiddenCategorical({ channel: draft.channel, text: draft.text });
  // Rule-based порушення прив'язані за побудовою: hits — це слова, знайдені У ТЕКСТІ, тож вони
  // самі є цитатою і НЕ проходять groundViolations (їм нема чого не пройти).
  const ruleViolations: Violation[] = [
    ...(hedge.hits ?? []).map((q) => ({ quote: q, issue: "надмірна невпевненість (hedging)" })),
    ...(cat.hits ?? []).map((q) => ({ quote: q, issue: "заборонена категоричність" })),
  ];
  const ruleIssues = ruleViolations.map((v) => `${v.issue}: «${v.quote}»`);

  const prompt = fillTemplate(loadPrompt("reviewer.md"), {
    draft: draft.text,
    channel: draft.channel,
    brief: JSON.stringify(s.company),
    hedgingFlags: JSON.stringify(ruleIssues),
    language: s.company.language,
  });

  const { parsed, cost } = await callStructured(
    deps.models.forAgent("reviewer"),
    ReviewResultSchema,
    prompt,
    modelId,
  );

  // Статус — КОД (determineStatus), а не LLM-поле (детермінований gate).
  const status = determineStatus(parsed.scores, parsed.factCheck);
  // Зведений список збирає КОД, а не модель. Усе, що прийшло від LLM, проходить перевірку
  // прив'язки до тексту; rule-based додається як є (воно прив'язане за побудовою).
  const fromLlm = [...parsed.factCheck.violations, ...parsed.hedgingIssues];
  const grounded = [
    ...groundViolations(parsed.factCheck.violations, draft.text),
    ...groundViolations(parsed.hedgingIssues, draft.text),
  ];
  const violations = dedupeViolations([...grounded, ...ruleViolations]);

  // Скільки порушень модель заявила і скільки з них підтвердилось цитатою. Логуємо ЗАВЖДИ, бо
  // «тихо відкинули все» і «порушень справді немає» ззовні виглядають однаково — а це протилежні
  // діагнози. Стабільно високий відсів = промпт поїхав або модель не тримає формат.
  if (fromLlm.length > 0) {
    deps.logger?.info(
      {
        node: "reviewer",
        draftId: draft.id,
        claimed: fromLlm.length,
        grounded: grounded.length,
        dropped: fromLlm.length - grounded.length,
        droppedQuotes: fromLlm
          .filter((v) => !grounded.some((g) => g.quote === v.quote))
          .map((v) => v.quote.slice(0, 60)),
      },
      "reviewer violations grounding",
    );
  }

  const final: FinalItem = {
    ...draft, // усі поля DraftItem (id/planItemId/channel/text/metadata/revisionHistory)
    scores: parsed.scores,
    factCheck: parsed.factCheck,
    violations,
    status,
    revisionNote: null, // людський note споживає Writer; Reviewer його не несе далі
  };
  return { final, cost };
}

export const makeReviewerNode =
  (deps: GraphDeps) =>
  async (s: ContentStateT): Promise<Partial<ContentStateT>> => {
    // Дискримінатор проходу зі стану (§7.5): final наповнює ЛИШЕ Reviewer, на першому рев'ю він порожній.
    const isRevision = s.final.length > 0;
    const needsRevIds = new Set(
      s.final.filter((f) => f.status === "needs_revision").map((f) => f.id),
    );
    const toReview = isRevision ? s.drafts.filter((d) => needsRevIds.has(d.id)) : s.drafts;

    const final: FinalItem[] = [];
    const errors: string[] = [];
    let cost: RunCost = { cents: 0, tokens: 0 };

    // Рев'ю кожного посту незалежне → пул замість суми латентностей.
    const settled = await mapPool(toReview, ITEM_CONCURRENCY, (d) => reviewOne(deps, s, d));

    settled.forEach((r, i) => {
      if (!r.ok) {
        const e = r.error;
        errors.push(`reviewer ${toReview[i]!.id}: ${e instanceof Error ? e.message : String(e)}`);
        return;
      }
      final.push(r.value.final);
      cost = addCost(cost, r.value.cost);
    });

    // final[] лише для рев'юнутих → mergeFinalById домердж за id (approved зберігаються).
    return { final, cost, errors };
  };
