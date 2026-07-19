import { and, count, desc, eq } from "drizzle-orm";
import { companies } from "@forteq/db";
import type { DbExecutor, PageParams, Paged } from "../di/types";
import type {
  CompaniesRepo,
  Company,
  CompanyPatch,
  NewCompany,
} from "./interfaces";

type CompanyRow = typeof companies.$inferSelect;

function toCompany(row: CompanyRow): Company {
  return {
    id: row.id,
    name: row.name,
    positioning: row.positioning,
    websiteUrl: row.websiteUrl,
    description: row.description,
    stack: row.stack ?? [],
    services: row.services ?? [],
    audience: row.audience,
  };
}

// Drizzle-репозиторій компаній (§4.2). Працює на request-scoped tx (RLS + app-level accountId).
export class DrizzleCompaniesRepo implements CompaniesRepo {
  constructor(private readonly tx: DbExecutor) {}

  async create(accountId: string, data: NewCompany): Promise<Company> {
    const [row] = await this.tx
      .insert(companies)
      .values({
        accountId,
        name: data.name,
        positioning: data.positioning ?? null,
        websiteUrl: data.websiteUrl ?? null,
        description: data.description ?? null,
        stack: data.stack ?? [],
        services: data.services ?? [],
        audience: data.audience ?? null,
      })
      .returning();
    return toCompany(row);
  }

  async findById(accountId: string, id: string): Promise<Company | null> {
    const [row] = await this.tx
      .select()
      .from(companies)
      .where(and(eq(companies.accountId, accountId), eq(companies.id, id)))
      .limit(1);
    return row ? toCompany(row) : null;
  }

  // Company switcher: усі компанії акаунта без пагінації (RLS-scoped за current_account_id).
  async listByAccount(accountId: string): Promise<Company[]> {
    const rows = await this.tx
      .select()
      .from(companies)
      .where(eq(companies.accountId, accountId))
      .orderBy(desc(companies.createdAt));
    return rows.map(toCompany);
  }

  async list(accountId: string, page: PageParams): Promise<Paged<Company>> {
    const offset = (page.page - 1) * page.pageSize;
    const rows = await this.tx
      .select()
      .from(companies)
      .where(eq(companies.accountId, accountId))
      .orderBy(desc(companies.createdAt))
      .limit(page.pageSize)
      .offset(offset);
    const [agg] = await this.tx
      .select({ value: count() })
      .from(companies)
      .where(eq(companies.accountId, accountId));
    return {
      items: rows.map(toCompany),
      page: page.page,
      pageSize: page.pageSize,
      total: Number(agg?.value ?? 0),
    };
  }

  async update(accountId: string, id: string, patch: CompanyPatch): Promise<Company | null> {
    const set: Partial<CompanyRow> = {};
    if (patch.name !== undefined) set.name = patch.name;
    if (patch.positioning !== undefined) set.positioning = patch.positioning;
    if (patch.websiteUrl !== undefined) set.websiteUrl = patch.websiteUrl;
    if (patch.description !== undefined) set.description = patch.description;
    if (patch.stack !== undefined) set.stack = patch.stack;
    if (patch.services !== undefined) set.services = patch.services;
    if (patch.audience !== undefined) set.audience = patch.audience;

    if (Object.keys(set).length === 0) return this.findById(accountId, id);

    const [row] = await this.tx
      .update(companies)
      .set(set)
      .where(and(eq(companies.accountId, accountId), eq(companies.id, id)))
      .returning();
    return row ? toCompany(row) : null;
  }

  async delete(accountId: string, id: string): Promise<boolean> {
    // Фізичний DELETE: у frozen-схемі всі дочірні FK на companies — ON DELETE CASCADE.
    // Guard «активні runs» перевіряється у сервісі перед викликом (§2.9).
    const rows = await this.tx
      .delete(companies)
      .where(and(eq(companies.accountId, accountId), eq(companies.id, id)))
      .returning({ id: companies.id });
    return rows.length > 0;
  }
}
