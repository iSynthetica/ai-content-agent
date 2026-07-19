// plan_entries — датовані слоти контент-плану (§2.11 раунд 2). Слот проходить шлях
// proposed → approved → scheduled → generating → generated, і саме він, а не прогін, є одиницею
// планування: тема обирається у слоті, і лише потім слот запускає генерацію.
//
// Кожен запит фільтрує за account_id ЯВНО, попри те що RLS уже це гарантує (ADR-0003).
// Це свідомий захист у два шари, як і в решті репозиторіїв: якщо скоуп транзакції колись
// не виставиться через баг у middleware, запит поверне порожньо, а не чужі дані.
import { and, asc, eq, gte, inArray, isNull, lte, or } from "drizzle-orm";
import { planEntries } from "@forteq/db";
import type { DbExecutor } from "../di/types";
import type { NewPlanEntry, PlanEntry, PlanEntriesRepo, PlanEntryPatch } from "./interfaces";

type Row = typeof planEntries.$inferSelect;

function toEntry(r: Row): PlanEntry {
  return {
    id: r.id,
    date: r.date,
    channel: r.channel,
    topic: r.topic,
    keyMessage: r.keyMessage,
    seoKeywords: r.seoKeywords ?? [],
    pillar: r.pillar,
    source: r.source,
    status: r.status,
  };
}

export class DrizzlePlanEntriesRepo implements PlanEntriesRepo {
  constructor(private readonly tx: DbExecutor) {}

  /**
   * Слоти компанії. Діапазон дат опційний; undated-слоти (беклог) повертаються завжди —
   * вони не належать жодному тижню, і ховати їх за фільтром означало б непомітно втратити
   * теми, які користувач відклав «на потім».
   */
  async listByCompany(
    accountId: string,
    companyId: string,
    range?: { from?: string; to?: string },
  ): Promise<PlanEntry[]> {
    const bounds = [];
    if (range?.from) bounds.push(gte(planEntries.date, range.from));
    if (range?.to) bounds.push(lte(planEntries.date, range.to));

    const scope = and(eq(planEntries.accountId, accountId), eq(planEntries.companyId, companyId));
    const where =
      bounds.length > 0 ? and(scope, or(isNull(planEntries.date), and(...bounds))) : scope;

    const rows = await this.tx
      .select()
      .from(planEntries)
      .where(where)
      .orderBy(asc(planEntries.date), asc(planEntries.channel));

    return rows.map(toEntry);
  }

  /** Проєкція для перевірки дублів під час матеріалізації (ідемпотентність). */
  async listDatedKeys(
    accountId: string,
    companyId: string,
  ): Promise<Array<{ date: string | null; channel: string }>> {
    return this.tx
      .select({ date: planEntries.date, channel: planEntries.channel })
      .from(planEntries)
      .where(and(eq(planEntries.accountId, accountId), eq(planEntries.companyId, companyId)));
  }

  async insertMany(accountId: string, rows: NewPlanEntry[]): Promise<number> {
    if (rows.length === 0) return 0;
    const inserted = await this.tx
      .insert(planEntries)
      .values(rows.map((r) => ({ ...r, accountId })))
      .returning({ id: planEntries.id });
    return inserted.length;
  }

  async findById(accountId: string, id: string): Promise<PlanEntry | null> {
    const [row] = await this.tx
      .select()
      .from(planEntries)
      .where(and(eq(planEntries.accountId, accountId), eq(planEntries.id, id)));
    return row ? toEntry(row) : null;
  }

  async patch(accountId: string, id: string, patch: PlanEntryPatch): Promise<PlanEntry | null> {
    // Ручне редагування теми змінює провенанс: слот більше не «запропонований AI».
    const [row] = await this.tx
      .update(planEntries)
      .set({ ...patch, source: "user_defined" })
      .where(and(eq(planEntries.accountId, accountId), eq(planEntries.id, id)))
      .returning();
    return row ? toEntry(row) : null;
  }

  /**
   * Погодження слотів. Дозволено лише з `proposed`: погоджувати вже згенерований або
   * скасований слот безглуздо, а мовчазний перехід приховав би помилку в UI.
   * Повертає кількість реально змінених рядків, щоб викликач бачив розбіжність.
   */
  async approve(accountId: string, ids: string[]): Promise<number> {
    if (ids.length === 0) return 0;
    const rows = await this.tx
      .update(planEntries)
      .set({ status: "approved" })
      .where(
        and(
          eq(planEntries.accountId, accountId),
          inArray(planEntries.id, ids),
          eq(planEntries.status, "proposed"),
        ),
      )
      .returning({ id: planEntries.id });
    return rows.length;
  }
}
