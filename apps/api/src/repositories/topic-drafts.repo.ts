import { and, eq } from "drizzle-orm";
import { runTopicDrafts } from "@forteq/db";
import type { DbExecutor } from "../di/types";
import type { NewTopicDraft, TopicDraft, TopicDraftsRepo } from "./interfaces";

type Row = typeof runTopicDrafts.$inferSelect;

function toDraft(row: Row): TopicDraft {
  return {
    id: row.id,
    status: row.status as TopicDraft["status"],
    topics: (row.topics as TopicDraft["topics"]) ?? null,
    error: row.error,
  };
}

// run_topic_drafts — короткоживучі scratch-рядки для topic preview (§runtopics). insert пишеться
// у request-txn; worker дописує status/topics/error у власній job-scoped txn (не через цей репо).
export class DrizzleTopicDraftsRepo implements TopicDraftsRepo {
  constructor(private readonly tx: DbExecutor) {}

  async create(accountId: string, data: NewTopicDraft): Promise<{ id: string }> {
    const [row] = await this.tx
      .insert(runTopicDrafts)
      .values({
        accountId,
        companyId: data.companyId,
        status: "pending",
        input: data.input,
      })
      .returning({ id: runTopicDrafts.id });
    return { id: row.id };
  }

  async findByCompanyAndId(
    accountId: string,
    companyId: string,
    id: string,
  ): Promise<TopicDraft | null> {
    const [row] = await this.tx
      .select()
      .from(runTopicDrafts)
      .where(
        and(
          eq(runTopicDrafts.accountId, accountId),
          eq(runTopicDrafts.companyId, companyId),
          eq(runTopicDrafts.id, id),
        ),
      );
    return row ? toDraft(row) : null;
  }
}
