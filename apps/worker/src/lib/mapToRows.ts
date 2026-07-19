// Тип рядка content_items беремо з РЕАЛЬНОЇ схеми БД (drizzle $inferInsert).
// import type — суто на рівні типів, тож mapToRows лишається чистою функцією без рантайм-імпорту @forteq/db.
import type { contentItems } from "@forteq/db";
// Барʼєр B2: реальний публічний тип пайплайна (локальну стаб-декларацію прибрано).
import type { FinalItem } from "@forteq/pipeline";

// Рядок для upsert у content_items. companyId/accountId домішує хендлер зі scope/job (§13),
// тож mapToRows їх не заповнює — звідси Omit.
export type ContentItemRow = typeof contentItems.$inferInsert;
export type MappedContentItem = Omit<ContentItemRow, "companyId" | "accountId">;

// Міст двох словників статусів (spike-1 §4): QA-статус пайплайна → workflow-статус БД (itemStatus pgEnum).
// 'flagged' у pgEnum НЕМАЄ → мапимо у 'needs_revision' (елемент потребує уваги людини).
// 'draft'/'rejected' — суто workflow, пайплайн їх не емітить. Мапінг тотальний, без діри.
const STATUS_MAP: Record<FinalItem["status"], "approved" | "needs_revision"> = {
  approved: "approved",
  needs_revision: "needs_revision",
  flagged: "needs_revision",
};

/**
 * Мапить DTO пайплайна (FinalItem[]) у рядки content_items для upsertMany (spike-1 §13).
 * id рядка = FinalItem.id (стабільний, planItem-derived) → ON CONFLICT(id) DO UPDATE робить
 * повторний start/retry черги ІДЕМПОТЕНТНИМ (а НЕ defaultRandom, який дублював би пости).
 */
export function mapToRows(runId: string, final: FinalItem[]): MappedContentItem[] {
  return final.map((f) => ({
    id: f.id,
    runId,
    channel: f.channel,
    text: f.text,
    scores: f.scores,
    violations: f.violations,
    status: STATUS_MAP[f.status],
    revisionHistory: f.revisionHistory,
  }));
}
