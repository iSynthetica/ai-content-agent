import { and, count, desc, eq, gte, inArray, isNotNull, isNull, lte, sql } from "drizzle-orm";
import { contentItems, generationRuns } from "@forteq/db";
import type { DbExecutor, Paged } from "../di/types";
import type {
  NewRun,
  RunDecisionRow,
  RunListFilter,
  RunsRepo,
  RunStatus,
  RunSummary,
} from "./interfaces";

type RunRow = typeof generationRuns.$inferSelect;

const ACTIVE_STATUSES: RunStatus[] = ["queued", "running", "needs_review"];

function toSummary(row: RunRow, counts?: RunSummary["counts"]): RunSummary {
  return {
    id: row.id,
    companyId: row.companyId,
    status: row.status,
    scheduledFor: row.scheduledFor ? row.scheduledFor.toISOString() : null,
    costCents: row.costCents,
    createdAt: row.createdAt.toISOString(),
    // Per-node прогрес пайплайна (§progress) — проєкція з рядка run (get віддає завжди; для list — теж
    // безкоштовно, колонка вже в select). null, поки прогону ще не торкнувся жоден крок.
    progress: row.progress ?? null,
    runConfig: (row.runConfig ?? null) as RunSummary["runConfig"],
    // archived_at — Date|null із драйвера; на межі віддаємо ISO-рядок або null (форма runDTO).
    archivedAt: row.archivedAt ? row.archivedAt.toISOString() : null,
    ...(counts ? { counts } : {}),
  };
}

// generation_runs: api володіє «наміром» (створення queued-run); worker — «результатом графа»
// (status→running/needs_review/…, content_items). api граф НЕ ганяє (§11).
export class DrizzleRunsRepo implements RunsRepo {
  constructor(private readonly tx: DbExecutor) {}

  async create(data: NewRun): Promise<{ id: string }> {
    const [row] = await this.tx
      .insert(generationRuns)
      .values({
        accountId: data.accountId,
        companyId: data.companyId,
        status: data.status,
        trigger: data.trigger,
        scheduledFor: data.scheduledFor,
        modelConfig: data.modelConfig,
        runConfig: data.runConfig ?? null,
        threadId: data.threadId,
        createdBy: data.createdBy,
      })
      .returning({ id: generationRuns.id });
    return { id: row.id };
  }

  async findById(accountId: string, id: string): Promise<RunSummary | null> {
    const [row] = await this.tx
      .select()
      .from(generationRuns)
      .where(and(eq(generationRuns.accountId, accountId), eq(generationRuns.id, id)))
      .limit(1);
    if (!row) return null;

    const [agg] = await this.tx
      .select({
        total: count(),
        needs: count(sql`case when ${contentItems.status} = 'needs_revision' then 1 end`),
      })
      .from(contentItems)
      .where(and(eq(contentItems.accountId, accountId), eq(contentItems.runId, id)));

    return toSummary(row, {
      items: Number(agg?.total ?? 0),
      needsReview: Number(agg?.needs ?? 0),
    });
  }

  async listByCompany(
    accountId: string,
    companyId: string,
    filter: RunListFilter,
  ): Promise<Paged<RunSummary>> {
    const conds = [eq(generationRuns.accountId, accountId), eq(generationRuns.companyId, companyId)];
    if (filter.status) conds.push(eq(generationRuns.status, filter.status));
    if (filter.from) conds.push(gte(generationRuns.createdAt, new Date(filter.from)));
    if (filter.to) conds.push(lte(generationRuns.createdAt, new Date(filter.to)));
    // Архів-фільтр (§run-archive): дефолт (undefined) === "exclude" — основний список ховає архів.
    // "only" — лише архівовані (окремий вигляд), "all" — без фільтра (жодного нового condition).
    const archived = filter.archived ?? "exclude";
    if (archived === "exclude") conds.push(isNull(generationRuns.archivedAt));
    else if (archived === "only") conds.push(isNotNull(generationRuns.archivedAt));
    const where = and(...conds);

    const offset = (filter.page - 1) * filter.pageSize;
    const rows = await this.tx
      .select()
      .from(generationRuns)
      .where(where)
      .orderBy(desc(generationRuns.createdAt))
      .limit(filter.pageSize)
      .offset(offset);
    const [agg] = await this.tx.select({ value: count() }).from(generationRuns).where(where);

    return {
      items: rows.map((r) => toSummary(r)),
      page: filter.page,
      pageSize: filter.pageSize,
      total: Number(agg?.value ?? 0),
    };
  }

  // HITL-рішення (§7): проєкція статусу+threadId під FOR UPDATE — рядок run блокується на час
  // request-txn, тож перевірка «статус ∈ дозволені» і запис нового статусу атомарні (compare-and-set,
  // §7.1) проти паралельного approve/worker-update.
  async getForDecision(accountId: string, id: string): Promise<RunDecisionRow | null> {
    const [row] = await this.tx
      .select({
        id: generationRuns.id,
        companyId: generationRuns.companyId,
        status: generationRuns.status,
        threadId: generationRuns.threadId,
      })
      .from(generationRuns)
      .where(and(eq(generationRuns.accountId, accountId), eq(generationRuns.id, id)))
      .limit(1)
      .for("update");
    return row ?? null;
  }

  async updateStatus(accountId: string, id: string, status: RunStatus): Promise<void> {
    await this.tx
      .update(generationRuns)
      .set({ status })
      .where(and(eq(generationRuns.accountId, accountId), eq(generationRuns.id, id)));
  }

  // М'яке архівування прогону (§run-archive): value=Date → в архів, value=null → розархівувати.
  // Свідомо НЕ чіпає status — архів ортогональний до run_status (прогін зберігає свій статус).
  async setArchivedAt(accountId: string, id: string, value: Date | null): Promise<RunSummary | null> {
    const [row] = await this.tx
      .update(generationRuns)
      .set({ archivedAt: value })
      .where(and(eq(generationRuns.accountId, accountId), eq(generationRuns.id, id)))
      .returning();
    return row ? toSummary(row) : null;
  }

  // Незворотне видалення прогону (§run-archive hard-delete). content_items, publications та
  // content_item_versions зникають каскадом (FK ON DELETE cascade). true лише коли рядок справді був.
  async deleteById(accountId: string, id: string): Promise<boolean> {
    const rows = await this.tx
      .delete(generationRuns)
      .where(and(eq(generationRuns.accountId, accountId), eq(generationRuns.id, id)))
      .returning({ id: generationRuns.id });
    return rows.length > 0;
  }

  async countActiveByCompany(accountId: string, companyId: string): Promise<number> {
    const [agg] = await this.tx
      .select({ value: count() })
      .from(generationRuns)
      .where(
        and(
          eq(generationRuns.accountId, accountId),
          eq(generationRuns.companyId, companyId),
          inArray(generationRuns.status, ACTIVE_STATUSES),
        ),
      );
    return Number(agg?.value ?? 0);
  }
}
