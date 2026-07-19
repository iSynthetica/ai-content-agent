// Ідемпотентний upsert FinalItem[] → content_items (spike-1 §13). Спільний для start/resume.
// id рядка = FinalItem.id (стабільний, planItem-derived) → ON CONFLICT(id) DO UPDATE робить повторний
// прогін/retry ІДЕМПОТЕНТНИМ. accountId/companyId домішує хендлер (зі scope/job), тож не в mapToRows.
import { sql } from "drizzle-orm";
import { contentItems } from "@forteq/db";
import type { FinalItem } from "@forteq/pipeline";
import type { Tx } from "../composition.js";
import { mapToRows } from "./mapToRows.js";

export async function upsertContentItems(
  tx: Tx,
  runId: string,
  accountId: string,
  companyId: string,
  final: FinalItem[],
): Promise<void> {
  const rows = mapToRows(runId, final).map((r) => ({ ...r, accountId, companyId }));
  if (rows.length === 0) return;
  await tx
    .insert(contentItems)
    .values(rows)
    .onConflictDoUpdate({
      target: contentItems.id,
      // excluded.* — значення вхідного рядка (per-conflict), а не сталий вираз (коректно для multi-row).
      //
      // image_url СВІДОМО відсутній (§7.4): відколи картинки поїхали з графа у job content.visuals,
      // пайплайн їх не веде і завжди приносить imageUrl=null. Якби ми його тут оновлювали, кожна
      // ревізія затирала б уже намальовану картинку — і наступний enqueue оплачував би її повторно.
      // Тепер власник поля один: job content.visuals (а інвалідацію при ревізії робить handleResume явно).
      set: {
        channel: sql`excluded.channel`,
        text: sql`excluded.text`,
        scores: sql`excluded.scores`,
        violations: sql`excluded.violations`,
        status: sql`excluded.status`,
        revisionHistory: sql`excluded.revision_history`,
      },
    });
}
