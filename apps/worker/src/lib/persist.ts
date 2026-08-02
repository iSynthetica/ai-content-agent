// Ідемпотентний upsert FinalItem[] → content_items (spike-1 §13). Спільний для start/resume.
// id рядка = FinalItem.id (стабільний, planItem-derived) → ON CONFLICT(id) DO UPDATE робить повторний
// прогін/retry ІДЕМПОТЕНТНИМ. accountId/companyId домішує хендлер (зі scope/job), тож не в mapToRows.
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { contentItems, contentItemVersions } from "@forteq/db";
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

  // §content-editing: знімок згенерованого тексту одразу після persist — без цього "згенерований
  // текст" ніде не відновити після першої ж людської правки (content_items тримає лише ПОТОЧНИЙ
  // текст, не історію). Пишемо ОДНИМ запитом на весь батч, тож ретрай усього прогону не тримає
  // txn відкритою довше, ніж сам upsert вище.
  await recordGeneratedVersions(tx, accountId, final);
}

// Guard проти дублів (§retro): upsertContentItems ІДЕМПОТЕНТНИЙ і його можуть викликати повторно
// з тим самим текстом (retry черги, повторний start), а ревізія завжди перезаписує text — тому
// пишемо нову generated-версію ЛИШЕ якщо вона відрізняється від останньої відомої (будь-якого
// джерела: людська правка теж рахується як "останній відомий стан", інакше generated-ретрай
// затер би її в історії дублем).
async function recordGeneratedVersions(
  tx: Tx,
  accountId: string,
  final: FinalItem[],
): Promise<void> {
  const ids = final.map((f) => f.id);
  if (ids.length === 0) return;

  // Останній запис на КОЖЕН айтем: без DISTINCT ON (перенос між драйверами $type тут не вартий
  // ускладнення) — рядків мало (batch ≤ MAX_POSTS_PER_RUN), тож фільтр у JS дешевший за window-SQL.
  const recent = await tx
    .select({ contentItemId: contentItemVersions.contentItemId, text: contentItemVersions.text })
    .from(contentItemVersions)
    .where(
      and(eq(contentItemVersions.accountId, accountId), inArray(contentItemVersions.contentItemId, ids)),
    )
    .orderBy(desc(contentItemVersions.createdAt));

  const latestTextByItem = new Map<string, string>();
  for (const row of recent) {
    if (!latestTextByItem.has(row.contentItemId)) latestTextByItem.set(row.contentItemId, row.text);
  }

  const toInsert = final
    .filter((f) => latestTextByItem.get(f.id) !== f.text)
    .map((f) => ({
      accountId,
      contentItemId: f.id,
      source: "generated" as const,
      text: f.text,
    }));

  if (toInsert.length === 0) return;
  await tx.insert(contentItemVersions).values(toInsert);
}
