import { and, eq } from "drizzle-orm";
import { contentPlans } from "@forteq/db";
import type { DbExecutor } from "../di/types";
import type {
  ContentPlan,
  ContentPlanPatch,
  ContentPlansRepo,
  NewContentPlan,
} from "./interfaces";

type PlanRow = typeof contentPlans.$inferSelect;

function toPlan(row: PlanRow): ContentPlan {
  return {
    id: row.id,
    companyId: row.companyId,
    name: row.name,
    channelCounts: row.channelCounts ?? {},
    config: row.config ?? null,
  };
}

// content_plans — МВП бере ЄДИНИЙ (активний) план компанії (§2.11). Кілька планів — шов.
export class DrizzleContentPlansRepo implements ContentPlansRepo {
  constructor(private readonly tx: DbExecutor) {}

  async getByCompany(accountId: string, companyId: string): Promise<ContentPlan | null> {
    const [row] = await this.tx
      .select()
      .from(contentPlans)
      .where(and(eq(contentPlans.accountId, accountId), eq(contentPlans.companyId, companyId)))
      .limit(1);
    return row ? toPlan(row) : null;
  }

  async create(accountId: string, companyId: string, data: NewContentPlan): Promise<ContentPlan> {
    // Object-literal → drizzle звіряє з InferInsert; невизначені поля беруть DB-дефолти.
    const [row] = await this.tx
      .insert(contentPlans)
      .values({
        accountId,
        companyId,
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.channelCounts !== undefined ? { channelCounts: data.channelCounts } : {}),
        ...(data.config !== undefined ? { config: data.config } : {}),
      })
      .returning();
    return toPlan(row);
  }

  async updateById(accountId: string, id: string, patch: ContentPlanPatch): Promise<ContentPlan | null> {
    const set: Partial<PlanRow> = {};
    if (patch.name !== undefined) set.name = patch.name;
    if (patch.channelCounts !== undefined) set.channelCounts = patch.channelCounts;
    if (patch.config !== undefined) set.config = patch.config;

    if (Object.keys(set).length === 0) {
      const [row] = await this.tx
        .select()
        .from(contentPlans)
        .where(and(eq(contentPlans.accountId, accountId), eq(contentPlans.id, id)))
        .limit(1);
      return row ? toPlan(row) : null;
    }

    const [row] = await this.tx
      .update(contentPlans)
      .set(set)
      .where(and(eq(contentPlans.accountId, accountId), eq(contentPlans.id, id)))
      .returning();
    return row ? toPlan(row) : null;
  }
}
