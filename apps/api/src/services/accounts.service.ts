import { AppError } from "../http/errors";
import type { AuthCtx } from "../di/types";
import type {
  Account,
  AccountsRepo,
  CompaniesRepo,
  Company,
} from "../repositories/interfaces";

// Акаунти користувача + компанії акаунта — дані для switcher-ів shell (§B3). Читання за членством
// user (RLS accounts_member_read/memberships_read_own); крос-акаунт закриває guard isMember → 403.
export class AccountsService {
  constructor(
    private readonly accounts: AccountsRepo,
    private readonly companies: CompaniesRepo,
  ) {}

  // GET /v1/accounts — усі акаунти поточного user (switcher).
  async list(ctx: AuthCtx): Promise<Account[]> {
    return this.accounts.listByUser(ctx.userId);
  }

  // GET /v1/accounts/:accountId/companies — компанії акаунта. Guard: user мусить бути членом
  // :accountId (інакше 403). RLS далі скоупить рядки за активним акаунтом (MVP: == :accountId).
  async listCompanies(ctx: AuthCtx, accountId: string): Promise<Company[]> {
    const member = await this.accounts.isMember(ctx.userId, accountId);
    if (!member) throw AppError.forbidden("not a member of this account");
    return this.companies.listByAccount(accountId);
  }
}
