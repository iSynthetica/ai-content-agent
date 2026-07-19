// Фікстур-brief + канонічні фейкові відповіді агентів для інтеграційних/юніт-тестів (§14).
import { DEFAULT_MODELS } from "../../src/config";
import type { CompanyContext, PipelineInput, RunMeta } from "../../src/types";
import type { Responder } from "./fakeModel";

export const company: CompanyContext = {
  name: "Forteq",
  positioning: "IT-сервісна компанія для B2B",
  stack: ["TypeScript", "Node.js", "PostgreSQL"],
  services: ["веб-розробка", "інтеграції", "DevOps"],
  audience: "CTO та tech-ліди середнього бізнесу",
  toneOfVoice: "професійний, без води",
  toneExamples: [],
  visualStyle: "чистий, сучасний, синій акцент",
  forbiddenPhrases: ["революційний", "унікальна можливість"],
  language: "uk",
};

export const meta: RunMeta = { runId: "run-1", accountId: "acc-1", companyId: "co-1" };

// Повний режим: 2 linkedin + 1 instagram = 3 елементи (один IG → гілка Visual).
export function fullInput(overrides: Partial<PipelineInput> = {}): PipelineInput {
  return {
    company,
    modelConfig: DEFAULT_MODELS,
    meta,
    channelConfig: { linkedin: 2, instagram: 1 },
    ...overrides,
  } as PipelineInput;
}

// ── фейкові LLM-відповіді ────────────────────────────────────────────────────
const researchResponse = {
  companyContext: "Forteq будує надійні B2B-рішення.",
  nicheTopics: ["інтеграції", "легасі-міграції", "DevOps", "TypeScript", "архітектура", "API"],
  audiencePains: ["довгий time-to-market", "технічний борг", "нестача інженерів"],
  competitorPatterns: [],
  sources: ["https://example.com/a", "not-a-valid-url", "https://example.com/b"],
};

// Три унікальні теми (2 linkedin + 1 instagram). Strategist присвоїть id (randomUUID) + дедуп.
const strategistResponse = {
  items: [
    { topic: "Topic A", channel: "linkedin", format: "post", keyMessage: "km-a", seoKeywords: ["k1"] },
    { topic: "Topic B", channel: "linkedin", format: "post", keyMessage: "km-b", seoKeywords: [] },
    { topic: "Topic C", channel: "instagram", format: "caption", keyMessage: "km-c", seoKeywords: [] },
  ],
};

// Writer: розрізняє revision за маркером "РЕВІЗІЯ" (з writer-revision.md).
const writerResponder: Responder = (input: string) =>
  input.includes("РЕВІЗІЯ")
    ? { text: "REVISED draft text", imagePromptSuggestion: "clean office desk", metaDescription: "d" }
    : {
        text: "Initial draft text for the post.",
        imagePromptSuggestion: "clean office desk",
        metaDescription: "d",
      };

const approvedReview = {
  draftId: "",
  scores: {
    toneAlignment: { score: 5, why: "тон точно відповідає бренду й аудиторії добре" },
    specificity: { score: 4, why: "достатньо конкретики з деталями під канал загалом" },
    factualCoherence: { score: 5, why: "узгоджено з фактами brief без вигадок зовсім" },
    channelFit: { score: 4, why: "формат відповідає нормам каналу цілком добре нині" },
  },
  factCheck: { companyFactsInPost: [], factsInBrief: [], violations: [], verdict: "pass" },
  hedgingIssues: [],
  violations: [],
  status: "approved",
};

// Flagged: fact-check fail → determineStatus поверне "flagged".
const flaggedReview = {
  ...approvedReview,
  factCheck: {
    companyFactsInPost: ["500 клієнтів"],
    factsInBrief: [],
    violations: ["вигадана цифра: 500 клієнтів"],
    verdict: "fail",
  },
  violations: ["вигадана цифра: 500 клієнтів"],
  status: "flagged",
};

export function approvedResponses(): Partial<Record<string, Responder>> {
  return {
    researcher: researchResponse,
    strategist: strategistResponse,
    writer: writerResponder,
    reviewer: approvedReview,
  };
}

export function flaggedResponses(): Partial<Record<string, Responder>> {
  return {
    researcher: researchResponse,
    strategist: strategistResponse,
    writer: writerResponder,
    reviewer: flaggedReview,
  };
}
