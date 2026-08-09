import { and, desc, eq, ne } from "drizzle-orm";
import { publications } from "@forteq/db";
import type { DbExecutor } from "../di/types";
import type {
  NewPendingPublication,
  PublicationRow,
  PublicationsRepo,
} from "./interfaces";

type Row = typeof publications.$inferSelect;

function toRow(row: Row): PublicationRow {
  return {
    id: row.id,
    contentItemId: row.contentItemId,
    provider: row.provider,
    status: row.status,
    externalUrl: row.externalUrl,
    error: row.error,
    publishedAt: row.publishedAt ? row.publishedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}

// publications — по рядку на (content_item, provider). api ЛИШЕ читає (per-run UI) і створює pending;
// результат (published/failed + externalUrl) пише worker. Скоуп за account_id (RLS + перший аргумент).
export class DrizzlePublicationsRepo implements PublicationsRepo {
  constructor(private readonly tx: DbExecutor) {}

  async listByRun(accountId: string, runId: string): Promise<PublicationRow[]> {
    const rows = await this.tx
      .select()
      .from(publications)
      .where(and(eq(publications.accountId, accountId), eq(publications.runId, runId)))
      .orderBy(desc(publications.createdAt));
    return rows.map(toRow);
  }

  async upsertPending(accountId: string, items: NewPendingPublication[]): Promise<void> {
    if (items.length === 0) return;
    await this.tx
      .insert(publications)
      .values(
        items.map((it) => ({
          accountId,
          contentItemId: it.contentItemId,
          runId: it.runId,
          provider: it.provider,
          status: "pending" as const,
        })),
      )
      // Повторний publish уже-провальної спроби скидає її назад у pending (retry), але НЕ чіпає
      // вже 'published' (setWhere): інакше worker (pending = status<>'published') передрукував би пост.
      .onConflictDoUpdate({
        target: [publications.contentItemId, publications.provider],
        set: { status: "pending", error: null, updatedAt: new Date() },
        setWhere: ne(publications.status, "published"),
      });
  }
}
