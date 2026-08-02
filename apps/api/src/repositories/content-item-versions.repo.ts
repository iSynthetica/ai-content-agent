// Історія версій тексту поста (§content-editing). Append-only лог: людська правка й revert лише
// ДОДАЮТЬ рядок, ніколи не змінюють і не видаляють наявні (сама історія — незмінний журнал).
import { and, desc, eq } from "drizzle-orm";
import { contentItemVersions } from "@forteq/db";
import type { DbExecutor } from "../di/types";
import type {
  ContentItemVersion,
  ContentItemVersionsRepo,
  NewContentItemVersion,
} from "./interfaces";

type VersionRow = typeof contentItemVersions.$inferSelect;

function toVersion(row: VersionRow): ContentItemVersion {
  return {
    id: row.id,
    contentItemId: row.contentItemId,
    source: row.source,
    text: row.text,
    title: row.title,
    editorUserId: row.editorUserId,
    createdAt: row.createdAt.toISOString(),
  };
}

export class DrizzleContentItemVersionsRepo implements ContentItemVersionsRepo {
  constructor(private readonly tx: DbExecutor) {}

  async insert(accountId: string, row: NewContentItemVersion): Promise<ContentItemVersion> {
    const [inserted] = await this.tx
      .insert(contentItemVersions)
      .values({
        accountId,
        contentItemId: row.contentItemId,
        source: row.source,
        text: row.text,
        title: row.title ?? null,
        editorUserId: row.editorUserId ?? null,
      })
      .returning();
    if (!inserted) throw new Error("content item version insert returned no row");
    return toVersion(inserted);
  }

  // Найновіша перша — історія читається як лог правок (GET .../versions).
  async listByItem(accountId: string, contentItemId: string): Promise<ContentItemVersion[]> {
    const rows = await this.tx
      .select()
      .from(contentItemVersions)
      .where(
        and(
          eq(contentItemVersions.accountId, accountId),
          eq(contentItemVersions.contentItemId, contentItemId),
        ),
      )
      .orderBy(desc(contentItemVersions.createdAt));
    return rows.map(toVersion);
  }

  async findById(accountId: string, id: string): Promise<ContentItemVersion | null> {
    const [row] = await this.tx
      .select()
      .from(contentItemVersions)
      .where(and(eq(contentItemVersions.accountId, accountId), eq(contentItemVersions.id, id)))
      .limit(1);
    return row ? toVersion(row) : null;
  }
}
