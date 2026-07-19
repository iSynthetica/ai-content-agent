// Layer 1 — rule-based перевірки (§12.1 spike-1). Чисті функції, БЕЗ залежності від pipeline.
// score 0..1. Пороги — прагматичні МВП-орієнтири, калібруються на референс-корпусі (M9.4).
// Reviewer у пайплайні імпортує hedgingCheck/forbiddenCategorical звідси (без дублювання Type 3).
import type { Channel } from "@forteq/shared";

export interface RuleCheckResult {
  name: string;
  passed: boolean;
  score: number; // 0..1
  details: string;
  // Конкретні збіги, знайдені у тексті (для перевірок, що шукають слова-маркери). Reviewer робить
  // з них порушення з ЦИТАТОЮ: кожен hit — дослівний фрагмент поста, тож прив'язка гарантована.
  hits?: string[];
}

export interface RuleCheckInput {
  channel: Channel;
  text: string;
  seoKeywords?: string[];
}

// ── утиліти ───────────────────────────────────────────────────────────────────
function words(text: string): string[] {
  const t = text.trim();
  return t ? t.split(/\s+/) : [];
}
function sentences(text: string): string[] {
  return text
    .split(/[.!?]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}
// Розбиття треду/секцій на блоки (порожній рядок як роздільник).
function blocks(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter(Boolean);
}
function ok(name: string, details: string): RuleCheckResult {
  return { name, passed: true, score: 1, details };
}
function naFor(name: string, channel: Channel): RuleCheckResult {
  return { name, passed: true, score: 1, details: `n/a for ${channel}` };
}

// ── length ────────────────────────────────────────────────────────────────────
// Межі під канал (символи, окрім blog — слова).
export function lengthCheck(input: RuleCheckInput): RuleCheckResult {
  const chars = input.text.trim().length;
  const wc = words(input.text).length;
  switch (input.channel) {
    case "twitter": {
      const bs = blocks(input.text);
      const longest = Math.max(0, ...bs.map((b) => b.length));
      const passed = longest <= 280;
      return {
        name: "length",
        passed,
        score: passed ? 1 : 0.4,
        details: `longest block ${longest} chars (limit 280)`,
      };
    }
    case "instagram": {
      const passed = chars > 0 && chars <= 2200;
      return {
        name: "length",
        passed,
        score: passed ? 1 : 0.5,
        details: `${chars} chars (limit 2200)`,
      };
    }
    case "linkedin": {
      const passed = chars >= 200 && chars <= 3000;
      return {
        name: "length",
        passed,
        score: passed ? 1 : chars < 200 ? 0.4 : 0.7,
        details: `${chars} chars (target 200..3000)`,
      };
    }
    case "blog": {
      const passed = wc >= 300;
      return {
        name: "length",
        passed,
        score: passed ? 1 : Math.min(0.9, wc / 300),
        details: `${wc} words (min 300)`,
      };
    }
    default:
      return ok("length", `${chars} chars`);
  }
}

// ── structure ─────────────────────────────────────────────────────────────────
// blog: наявність H2/H3; twitter: 3–5 блоків.
export function structureCheck(input: RuleCheckInput): RuleCheckResult {
  if (input.channel === "blog") {
    const hasH2 = /^##\s+\S/m.test(input.text);
    return {
      name: "structure",
      passed: hasH2,
      score: hasH2 ? 1 : 0.3,
      details: hasH2 ? "has H2 headings" : "missing '## ' headings",
    };
  }
  if (input.channel === "twitter") {
    const n = blocks(input.text).length;
    const passed = n >= 3 && n <= 5;
    return {
      name: "structure",
      passed,
      score: passed ? 1 : 0.5,
      details: `${n} blocks (target 3..5)`,
    };
  }
  return naFor("structure", input.channel);
}

// ── cta ───────────────────────────────────────────────────────────────────────
const CTA_RE =
  /(contact us|learn more|sign up|book a|get in touch|reach out|read more|download|subscribe|зв'яжіться|звертайтесь|дізнайтесь більше|детальніше|замов|напишіть нам|підпишіть|переходьте|залиш(те|)? заявку)/i;
export function ctaCheck(input: RuleCheckInput): RuleCheckResult {
  // Для blog CTA бажаний, але не жорсткий; для соц-каналів — важливіший.
  const found = CTA_RE.test(input.text);
  return {
    name: "cta",
    passed: found,
    score: found ? 1 : 0.6,
    details: found ? "CTA present" : "no explicit CTA detected",
  };
}

// ── generic phrases ─────────────────────────────────────────────────────────────
const GENERIC_PHRASES = [
  "game changer",
  "game-changer",
  "cutting-edge",
  "cutting edge",
  "synergy",
  "seamless",
  "revolutionary",
  "next-generation",
  "next generation",
  "state-of-the-art",
  "world-class",
  "unlock the power",
  "take it to the next level",
  "в умовах сьогодення",
  "у світі, що постійно змінюється",
  "команда професіоналів",
  "унікальна можливість",
  "інноваційні рішення",
  "широкий спектр послуг",
];
export function genericPhrasesFilter(input: RuleCheckInput): RuleCheckResult {
  const lower = input.text.toLowerCase();
  const hits = GENERIC_PHRASES.filter((p) => lower.includes(p));
  const passed = hits.length === 0;
  return {
    name: "generic_phrases",
    passed,
    score: passed ? 1 : Math.max(0, 1 - hits.length * 0.34),
    details: passed ? "no generic marketing clichés" : `clichés: ${hits.join(", ")}`,
  };
}

// ── readability (blog) ──────────────────────────────────────────────────────────
// Проста МВП-евристика: середня довжина речення у словах. Довші речення = важче читати.
export function readabilityCheck(input: RuleCheckInput): RuleCheckResult {
  if (input.channel !== "blog") return naFor("readability", input.channel);
  const ss = sentences(input.text);
  if (ss.length === 0) return { name: "readability", passed: false, score: 0, details: "no sentences" };
  const avg = words(input.text).length / ss.length;
  const passed = avg <= 25;
  const score = avg <= 20 ? 1 : avg <= 25 ? 0.8 : avg <= 32 ? 0.5 : 0.3;
  return {
    name: "readability",
    passed,
    score,
    details: `avg sentence length ${avg.toFixed(1)} words (target <= 25)`,
  };
}

// ── keyword density (blog) ──────────────────────────────────────────────────────
export function keywordDensity(input: RuleCheckInput): RuleCheckResult {
  if (input.channel !== "blog") return naFor("keyword_density", input.channel);
  const kws = input.seoKeywords ?? [];
  if (kws.length === 0) return ok("keyword_density", "no seoKeywords provided");
  const total = words(input.text).length || 1;
  const lower = input.text.toLowerCase();
  const densities = kws.map((kw) => {
    const k = kw.toLowerCase().trim();
    if (!k) return { kw, d: 0 };
    // кількість входжень ключа (як підрядка, огрублено — по кількості термів ключа)
    const kwWords = k.split(/\s+/).length;
    const count = lower.split(k).length - 1;
    return { kw, d: (count * kwWords) / total };
  });
  const maxD = Math.max(0, ...densities.map((x) => x.d));
  // ідеал 1–2%; терпимо до 3%; вище — stuffing; нижче 0.5% — недостатньо.
  const passed = maxD >= 0.005 && maxD <= 0.03;
  const score = maxD > 0.03 ? 0.3 : maxD >= 0.01 && maxD <= 0.02 ? 1 : maxD >= 0.005 ? 0.8 : 0.5;
  return {
    name: "keyword_density",
    passed,
    score,
    details: `max keyword density ${(maxD * 100).toFixed(2)}% (target 1..2%)`,
  };
}

// ── forbidden categorical (Type 3) ──────────────────────────────────────────────
const CATEGORICAL = [
  "завжди",
  "ніколи",
  "гарантовано",
  "гарантуємо",
  "100%",
  "на 100",
  "найкращий",
  "найкраща",
  "єдиний",
  "єдина",
  "беззаперечно",
  "абсолютно",
  "always",
  "never",
  "guaranteed",
  "the best",
  "#1",
  "world's best",
];
export function forbiddenCategorical(input: RuleCheckInput): RuleCheckResult {
  const lower = input.text.toLowerCase();
  const hits = CATEGORICAL.filter((c) => lower.includes(c));
  const passed = hits.length === 0;
  return {
    name: "forbidden_categorical",
    passed,
    score: passed ? 1 : Math.max(0, 1 - hits.length * 0.5),
    details: passed ? "no forbidden categorical claims" : `categorical: ${hits.join(", ")}`,
    hits: passed ? [] : hits,
  };
}

// ── hashtag count (instagram) ────────────────────────────────────────────────────
export function hashtagCount(input: RuleCheckInput): RuleCheckResult {
  if (input.channel !== "instagram") return naFor("hashtag_count", input.channel);
  const n = (input.text.match(/#[\p{L}0-9_]+/gu) ?? []).length;
  const passed = n >= 5 && n <= 15;
  return {
    name: "hashtag_count",
    passed,
    score: passed ? 1 : n < 5 ? 0.5 : 0.4,
    details: `${n} hashtags (target 5..15)`,
  };
}

// ── hedging (Type 3) ──────────────────────────────────────────────────────────────
const HEDGE_WORDS = [
  "можливо",
  "мабуть",
  "ймовірно",
  "напевно",
  "здається",
  "начебто",
  "десь",
  "певною мірою",
  "perhaps",
  "maybe",
  "might",
  "possibly",
  "seems",
  "arguably",
  "sort of",
  "kind of",
  "we think",
  "we believe",
];
export function hedgingCheck(input: RuleCheckInput): RuleCheckResult {
  const lower = input.text.toLowerCase();
  const hits = HEDGE_WORDS.filter((w) => lower.includes(w));
  // Поодинокий hedge допустимий; >2 різних маркерів — надмірна невпевненість.
  const passed = hits.length <= 2;
  return {
    name: "hedging",
    passed,
    score: passed ? 1 : Math.max(0, 1 - (hits.length - 2) * 0.25),
    details: passed
      ? `hedging within limit (${hits.length})`
      : `excessive hedging: ${hits.join(", ")}`,
    hits: passed ? [] : hits,
  };
}

// Прогін усіх перевірок над одним елементом (§12.1).
export function runAllChecks(input: RuleCheckInput): RuleCheckResult[] {
  return [
    lengthCheck(input),
    structureCheck(input),
    ctaCheck(input),
    genericPhrasesFilter(input),
    readabilityCheck(input),
    keywordDensity(input),
    forbiddenCategorical(input),
    hashtagCount(input),
    hedgingCheck(input),
  ];
}
