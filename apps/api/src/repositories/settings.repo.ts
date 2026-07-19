import { and, eq } from "drizzle-orm";
import { companySettings } from "@forteq/db";
import type { DbExecutor } from "../di/types";
import type { CompanySettings, SettingsPatch, SettingsRepo } from "./interfaces";

type SettingsRow = typeof companySettings.$inferSelect;

function toSettings(row: SettingsRow): CompanySettings {
  return {
    companyId: row.companyId,
    toneOfVoice: row.toneOfVoice,
    toneExamples: row.toneExamples ?? [],
    visualStyle: row.visualStyle,
    forbiddenPhrases: row.forbiddenPhrases ?? [],
    language: row.language,
    provider: row.provider,
    models: row.models ?? null,
  };
}

// company_settings — 1:1 до company. Upsert по PK company_id; account_id денормалізовано
// (RLS WITH CHECK: account_id = current_setting('app.current_account_id'), §2.10.2).
export class DrizzleSettingsRepo implements SettingsRepo {
  constructor(private readonly tx: DbExecutor) {}

  async getByCompany(accountId: string, companyId: string): Promise<CompanySettings | null> {
    const [row] = await this.tx
      .select()
      .from(companySettings)
      .where(and(eq(companySettings.accountId, accountId), eq(companySettings.companyId, companyId)))
      .limit(1);
    return row ? toSettings(row) : null;
  }

  async upsert(accountId: string, companyId: string, patch: SettingsPatch): Promise<CompanySettings> {
    // Лише визначені поля патча — решта беруть DB-дефолти на insert / лишаються на update.
    const fields: Partial<SettingsRow> = {};
    if (patch.toneOfVoice !== undefined) fields.toneOfVoice = patch.toneOfVoice;
    if (patch.toneExamples !== undefined) fields.toneExamples = patch.toneExamples;
    if (patch.visualStyle !== undefined) fields.visualStyle = patch.visualStyle;
    if (patch.forbiddenPhrases !== undefined) fields.forbiddenPhrases = patch.forbiddenPhrases;
    if (patch.language !== undefined) fields.language = patch.language;
    if (patch.provider !== undefined) fields.provider = patch.provider;
    if (patch.models !== undefined) fields.models = patch.models;

    const [row] = await this.tx
      .insert(companySettings)
      .values({ companyId, accountId, ...fields })
      .onConflictDoUpdate({ target: companySettings.companyId, set: fields })
      .returning();
    return toSettings(row);
  }
}
