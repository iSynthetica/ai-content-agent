import { and, desc, eq } from "drizzle-orm";
import { runConfigPresets } from "@forteq/db";
import type { DbExecutor } from "../di/types";
import type {
  NewRunConfigPreset,
  RunConfigPreset,
  RunConfigPresetsRepo,
} from "./interfaces";

type Row = typeof runConfigPresets.$inferSelect;

function toPreset(row: Row): RunConfigPreset {
  return {
    id: row.id,
    name: row.name,
    config: row.config,
    createdAt: row.createdAt.toISOString(),
  };
}

// run_config_presets — названі конфігурації прогону (§Phase 5). Per-company, ізоляція за account_id
// (RLS). accountId у WHERE — додаткова межа поверх RLS (той сам форсить, але явність не завадить).
export class DrizzleRunConfigPresetsRepo implements RunConfigPresetsRepo {
  constructor(private readonly tx: DbExecutor) {}

  async listByCompany(accountId: string, companyId: string): Promise<RunConfigPreset[]> {
    const rows = await this.tx
      .select()
      .from(runConfigPresets)
      .where(
        and(eq(runConfigPresets.accountId, accountId), eq(runConfigPresets.companyId, companyId)),
      )
      .orderBy(desc(runConfigPresets.createdAt));
    return rows.map(toPreset);
  }

  async create(accountId: string, data: NewRunConfigPreset): Promise<RunConfigPreset> {
    const [row] = await this.tx
      .insert(runConfigPresets)
      .values({ accountId, companyId: data.companyId, name: data.name, config: data.config })
      .returning();
    return toPreset(row!);
  }

  async deleteById(accountId: string, id: string): Promise<boolean> {
    const rows = await this.tx
      .delete(runConfigPresets)
      .where(and(eq(runConfigPresets.accountId, accountId), eq(runConfigPresets.id, id)))
      .returning({ id: runConfigPresets.id });
    return rows.length > 0;
  }
}
