// Writer (§7.3) — write + revision в одному модулі, режим — параметром конструктора.
//   initial: пише УСІ s.contentPlan.
//   revision: мішень = s.final.filter(status==="needs_revision") (виставлений Reviewer'ом АБО gate'ом);
//     join до плану за planItemId (топік/keyMessage/seoKeywords живуть у ContentPlanItem, не у FinalItem)
//     + фідбек із s.final (scores[*].why + violations + revisionNote). Переписуються ТІЛЬКИ вони.
// ІНВАРІАНТ: draft.id = plan.id (identity, НЕ randomUUID) — робить mergeDraftsById заміною, не дублюванням.
// Картинок writer НЕ веде (§7.4): вони живуть у content_items і належать job content.visuals;
// інвалідацію застарілого зображення після ревізії робить handleResume напряму в БД.
// Ізоляція помилок per-item → errors[] (NFR-2.2): один впалий пост не валить прогін.
import { z } from "zod";
import type { Channel } from "@forteq/shared";
import { loadPrompt } from "../lib/loadPrompt";
import { fillTemplate } from "../lib/fillTemplate";
import { callStructured } from "../lib/llm";
import { mapPool } from "../lib/mapPool";
import { ITEM_CONCURRENCY } from "../config";
import { addCost } from "../state";
import type { ContentStateT, RunCost } from "../state";
import type { GraphDeps } from "../ports";
import type { ContentPlanItem, DraftItem, FinalItem } from "../schemas";

// LLM-вихід Writer'а: текст + опційні метадані (одним викликом, §4).
// OpenAI structured-outputs (strict) вимагає, щоб УСІ поля були present → замість .optional()
// використовуємо .nullable() (поле присутнє, значення null, коли не релевантне каналу).
const DraftBodySchema = z.object({
  text: z.string(),
  imagePromptSuggestion: z.string().nullable(), // тільки instagram → вхід для Visual
  metaDescription: z.string().nullable(), // тільки blog
});

const CHANNEL_PROMPT: Record<Channel, string> = {
  linkedin: "linkedin.md",
  twitter: "twitter.md",
  instagram: "instagram.md",
  blog: "blog.md",
};

function wordCount(t: string): number {
  const trimmed = t.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

// Пише один пост. Constrained generation (Type 1/2, §08): у промпт заходить allowedFacts (JSON brief) —
// «використовуй ТІЛЬКИ ці факти», зовнішні цифри лише з research. draft.id === plan.id (провенанс).
async function writeOne(
  deps: GraphDeps,
  s: ContentStateT,
  plan: ContentPlanItem,
  feedback: FinalItem | undefined,
): Promise<{ draft: DraftItem; cost: RunCost }> {
  const modelId = s.modelConfig.models.writer;
  const base = loadPrompt(CHANNEL_PROMPT[plan.channel]);

  let prompt = fillTemplate(base, {
    plan: JSON.stringify(plan),
    topic: plan.topic,
    keyMessage: plan.keyMessage,
    format: plan.format,
    seoKeywords: (plan.seoKeywords ?? []).join(", "),
    allowedFacts: JSON.stringify(s.company),
    researchSources: JSON.stringify(s.research?.sources ?? []),
    nicheTopics: JSON.stringify(s.research?.nicheTopics ?? []),
    toneOfVoice: s.company.toneOfVoice ?? "professional",
    language: s.company.language,
    forbiddenPhrases: JSON.stringify(s.company.forbiddenPhrases ?? []),
  });

  // Ревізія: конкатенуємо дельта-інструкцію (writer-revision.md) з фідбеком Reviewer'а/людини.
  if (feedback) {
    const revision = fillTemplate(loadPrompt("writer-revision.md"), {
      previousText: feedback.text,
      violations: JSON.stringify(feedback.violations ?? []),
      scoreNotes: JSON.stringify(
        Object.entries(feedback.scores).map(([k, v]) => `${k}: ${v.why}`),
      ),
      humanNote: feedback.revisionNote ?? "(автоматична ревізія Reviewer'а, без людського коментаря)",
    });
    prompt = `${prompt}\n\n${revision}`;
  }

  const { parsed, cost } = await callStructured(
    deps.models.forAgent("writer"),
    DraftBodySchema,
    prompt,
    modelId,
  );

  const metadata: DraftItem["metadata"] = { wordCount: wordCount(parsed.text) };
  if (plan.channel === "instagram" && parsed.imagePromptSuggestion) {
    metadata.imagePromptSuggestion = parsed.imagePromptSuggestion;
  }
  if (plan.channel === "blog" && parsed.metaDescription) {
    metadata.metaDescription = parsed.metaDescription;
  }

  // Попередній текст пушимо в revisionHistory (лише при ревізії).
  const revisionHistory = feedback ? [...feedback.revisionHistory, feedback.text] : [];

  const draft: DraftItem = {
    id: plan.id, // ІНВАРІАНТ: id === planItemId
    planItemId: plan.id,
    channel: plan.channel,
    text: parsed.text,
    metadata,
    revisionHistory,
  };
  return { draft, cost };
}

export const makeWriterNode =
  (deps: GraphDeps, mode: "initial" | "revision") =>
  async (s: ContentStateT): Promise<Partial<ContentStateT>> => {
    // initial: усі елементи плану. revision: join needs_revision-фіналів до плану за planItemId.
    const targets =
      mode === "initial"
        ? s.contentPlan.map((plan) => ({ plan, feedback: undefined as FinalItem | undefined }))
        : s.final
            .filter((f) => f.status === "needs_revision")
            .map((f) => ({
              plan: s.contentPlan.find((p) => p.id === f.planItemId),
              feedback: f as FinalItem | undefined,
            }))
            .filter(
              (t): t is { plan: ContentPlanItem; feedback: FinalItem | undefined } => Boolean(t.plan),
            );

    const drafts: DraftItem[] = [];
    const errors: string[] = [];
    let cost: RunCost = { cents: 0, tokens: 0 };

    // Пости незалежні → пишемо їх паралельно (пул), а не сумою латентностей.
    const settled = await mapPool(targets, ITEM_CONCURRENCY, (t) =>
      writeOne(deps, s, t.plan, t.feedback),
    );

    // Розбір — послідовний і за індексом: порядок drafts[] і накопичення cost детерміновані.
    settled.forEach((r, i) => {
      if (!r.ok) {
        errors.push(`writer ${targets[i]!.plan.id}: ${errMsg(r.error)}`); // ізоляція per-item → errors[]
        return;
      }
      const { draft, cost: c } = r.value;
      drafts.push(draft);
      cost = addCost(cost, c);
    });

    deps.logger?.info(
      { node: "writer", mode, targets: targets.length, drafts: drafts.length, errCount: errors.length },
      "writer done",
    );

    if (mode === "initial") return { drafts, cost, errors };
    // revision: інкремент ЛИШЕ авто-лічильника (людський рухає gate).
    return { drafts, cost, errors, revisionCount: s.revisionCount + 1 };
  };
