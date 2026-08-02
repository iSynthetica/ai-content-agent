// Клієнтська zod-схема brief-форми (DS §7). Дзеркалить UpdateCompanyRequest + UpdateSettingsRequest
// із @forteq/shared, але в UI-зручній формі: масиви (stack/services/toneExamples/forbiddenPhrases)
// вводяться як рядки (кома/новий рядок), а на submit розкладаються на масиви (див. brief-mappers).
import { z } from "zod";

export const briefSchema = z.object({
  // company core
  name: z.string().min(1, "Вкажіть назву компанії"),
  websiteUrl: z
    .string()
    .trim()
    .url("Некоректний URL (приклад: https://forteq.systems)")
    .or(z.literal(""))
    .optional(),
  description: z.string().optional(),
  positioning: z.string().optional(),
  audience: z.string().optional(),
  stack: z.string().optional(), // «TypeScript, Next.js, PostgreSQL»
  services: z.string().optional(), // «Розробка MVP, AI-інтеграції»
  // settings (бренд + генерація)
  toneOfVoice: z.string().optional(),
  toneExamples: z.string().optional(), // по одному прикладу на рядок
  visualStyle: z.string().optional(),
  forbiddenPhrases: z.string().optional(), // «революційний, унікальний»
  language: z.string().optional(),
  // Дефолти LLM для генерації (дзеркало updateSettingsRequest із @forteq/shared):
  provider: z.enum(["openai", "anthropic", "gemini"]).optional(),
  models: z.record(z.string()).optional(), // { <agentKey>: modelId, visual: modelId }
  // Per-slot override (§ADR-0017): лише перевизначені ролі; решта беруть базовий provider+models.
  agentModels: z
    .record(z.object({ provider: z.enum(["openai", "anthropic", "gemini"]), model: z.string() }))
    .optional(),
});

export type BriefFormValues = z.infer<typeof briefSchema>;

// ── розбір/збірка масивів між UI-рядком і контрактом ─────────────────────────
export function splitList(raw: string | undefined, sep: "comma" | "newline" = "comma"): string[] {
  if (!raw) return [];
  const parts = sep === "newline" ? raw.split(/\r?\n/) : raw.split(",");
  return parts.map((s) => s.trim()).filter(Boolean);
}

export function joinList(items: string[] | null | undefined, sep: "comma" | "newline" = "comma"): string {
  if (!items || items.length === 0) return "";
  return items.join(sep === "newline" ? "\n" : ", ");
}
