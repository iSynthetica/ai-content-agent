import { and, asc, eq } from "drizzle-orm";
import { contentItems } from "@forteq/db";
import type { DbExecutor } from "../di/types";
import type {
  ContentItem,
  ContentItemContentPatch,
  ContentItemsRepo,
  ItemStatus,
  ItemsQuery,
} from "./interfaces";

type ItemRow = typeof contentItems.$inferSelect;

function toItem(row: ItemRow): ContentItem {
  return {
    id: row.id,
    runId: row.runId,
    channel: row.channel,
    topic: row.topic,
    title: row.title,
    text: row.text,
    // scores/violations — jsonb, форму валідує контракт межі; тут проєкція без ре-парсингу.
    scores: (row.scores ?? null) as ContentItem["scores"],
    violations: (row.violations ?? null) as ContentItem["violations"],
    imageUrl: row.imageUrl,
    status: row.status,
    version: row.version,
  };
}

// content_items — api ЧИТАЄ (writer = worker, §11). Правки тексту/статусу (PATCH) — Фаза 3/4.
export class DrizzleContentItemsRepo implements ContentItemsRepo {
  constructor(private readonly tx: DbExecutor) {}

  async listByRun(accountId: string, runId: string, query: ItemsQuery): Promise<ContentItem[]> {
    const conds = [eq(contentItems.accountId, accountId), eq(contentItems.runId, runId)];
    if (query.channel) conds.push(eq(contentItems.channel, query.channel));

    const rows = await this.tx
      .select()
      .from(contentItems)
      .where(and(...conds))
      .orderBy(asc(contentItems.createdAt));
    return rows.map(toItem);
  }

  // per-item HITL (§7): читання одного айтема під accountId-скоуп (для перевірки належності + DTO).
  async findById(accountId: string, id: string): Promise<ContentItem | null> {
    const [row] = await this.tx
      .select()
      .from(contentItems)
      .where(and(eq(contentItems.accountId, accountId), eq(contentItems.id, id)))
      .limit(1);
    return row ? toItem(row) : null;
  }

  // Прямий workflow-статус айтема (approve→approved / reject→rejected / rerun→needs_revision, §7).
  // Без графа: writer-поля (text/scores/violations) не чіпаємо — їх володіє worker (§11).
  async updateStatus(accountId: string, id: string, status: ItemStatus): Promise<ContentItem | null> {
    const [row] = await this.tx
      .update(contentItems)
      .set({ status })
      .where(and(eq(contentItems.accountId, accountId), eq(contentItems.id, id)))
      .returning();
    return row ? toItem(row) : null;
  }

  // Людська правка тексту/заголовка (§content-editing). Свідомо НЕ чіпає image_url (ADR-0012,
  // власник — job content.visuals) і не рухає status/scores/violations — це правка вмісту, а не
  // workflow-рішення.
  async updateContent(
    accountId: string,
    id: string,
    patch: ContentItemContentPatch,
  ): Promise<ContentItem | null> {
    const [row] = await this.tx
      .update(contentItems)
      .set({ text: patch.text, title: patch.title })
      .where(and(eq(contentItems.accountId, accountId), eq(contentItems.id, id)))
      .returning();
    return row ? toItem(row) : null;
  }

  // Роздача медіа (GET /media): належність ключа орендарю. RLS ізолює за accountId, тож достатньо
  // збігу image_url. select id LIMIT 1 — лише факт існування, байти читає ImageStoragePort окремо.
  async existsByImageUrl(accountId: string, imageUrl: string): Promise<boolean> {
    const [row] = await this.tx
      .select({ id: contentItems.id })
      .from(contentItems)
      .where(and(eq(contentItems.accountId, accountId), eq(contentItems.imageUrl, imageUrl)))
      .limit(1);
    return Boolean(row);
  }
}
