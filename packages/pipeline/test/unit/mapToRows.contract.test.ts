// Unit — контракт мапінгу QA-статус пайплайна → workflow-статус БД (§4/§13, S15).
// Пайплайн БД-таблиць не знає; тут перевіряємо ДОКУМЕНТОВАНИЙ контракт межі worker'а (STATUS_MAP)
// без залежності від @forteq/db: тотальність проти shared ITEM_STATUSES, flagged→needs_revision, id-passthrough.
import { describe, expect, it } from "vitest";
import { ITEM_STATUSES } from "@forteq/shared";
import { ReviewResultSchema } from "../../src/schemas";
import type { FinalItem } from "../../src/schemas";

// Дзеркало worker-контракту (apps/worker/src/lib/mapToRows.ts): 'flagged' у pgEnum немає → needs_revision.
const STATUS_MAP: Record<FinalItem["status"], "approved" | "needs_revision"> = {
  approved: "approved",
  needs_revision: "needs_revision",
  flagged: "needs_revision",
};

// Мінімальний мапер рядка (за контрактом §13): id рядка = FinalItem.id (ідемпотентний upsert).
function mapRow(runId: string, f: Pick<FinalItem, "id" | "status">) {
  return { id: f.id, runId, status: STATUS_MAP[f.status] };
}

describe("STATUS_MAP contract (§4/§13)", () => {
  const qaStatuses = ReviewResultSchema.shape.status.options as FinalItem["status"][];

  it("тотальний: КОЖЕН QA-статус мапиться у валідний ItemStatus (pgEnum не порушується)", () => {
    for (const qa of qaStatuses) {
      const mapped = STATUS_MAP[qa];
      expect(ITEM_STATUSES).toContain(mapped);
    }
  });

  it("'flagged' (немає у pgEnum) → 'needs_revision'", () => {
    expect(STATUS_MAP.flagged).toBe("needs_revision");
  });

  it("не емітить workflow-only статусів ('draft'/'rejected') — їх пайплайн не виробляє", () => {
    const produced = new Set(Object.values(STATUS_MAP));
    expect(produced.has("draft" as never)).toBe(false);
    expect(produced.has("rejected" as never)).toBe(false);
  });

  it("id рядка = FinalItem.id (стабільний, planItem-derived) → ідемпотентність upsert", () => {
    const row = mapRow("run-9", { id: "plan-item-42", status: "flagged" });
    expect(row.id).toBe("plan-item-42"); // НЕ defaultRandom
    expect(row.status).toBe("needs_revision");
  });
});
