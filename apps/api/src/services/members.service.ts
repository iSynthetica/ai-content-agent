import { randomBytes } from "node:crypto";
import type { Logger } from "pino";
import { roleSchema, type AddMemberResponse, type MemberDTO } from "@forteq/shared";
import { AppError } from "../http/errors";
import type { AuthCtx } from "../di/types";
import type { Auth } from "../auth/better-auth";
import type { MembersRepo } from "../repositories/interfaces";

// Керування членами акаунта (§RBAC member-mgmt F2). Активує наявний RBAC: список + додати/змінити
// роль/видалити. «Додати» провіженить увесь ланцюг (invite-provisions-user, див. tech-plan):
// ba_user-креденшл (better-auth) + доменний users + membership. Інваріанти форсяться ТУТ (не в БД):
// захист останнього owner, заборона міняти/видаляти самого себе.
export class MembersService {
  constructor(
    private readonly members: MembersRepo,
    private readonly auth: Auth,
    private readonly logger: Logger,
  ) {}

  async list(ctx: AuthCtx): Promise<{ items: MemberDTO[] }> {
    const rows = await this.members.listByAccount(ctx.accountId);
    return { items: rows.map(toDTO) };
  }

  async add(ctx: AuthCtx, input: { email: string; role: string }): Promise<AddMemberResponse> {
    const role = roleSchema.parse(input.role);
    const email = input.email.trim().toLowerCase();

    const existing = await this.members.findUserByEmail(email);
    if (existing) {
      // Уже є доменний користувач: додаємо членство в ЦЕЙ акаунт (пароль у нього свій).
      if (await this.members.memberRow(ctx.accountId, existing.userId)) {
        throw AppError.conflict(`${email} уже є членом цього акаунта`);
      }
      await this.members.insertMembership(ctx.accountId, existing.userId, role);
      const member = await this.members.memberRow(ctx.accountId, existing.userId);
      return { member: toDTO(member!), tempPassword: null };
    }

    // Новий інвайт: провіженимо ba_user із тимчасовим паролем, тоді доменний users + membership.
    const tempPassword = randomBytes(12).toString("base64url"); // ~16 символів, > min-8 better-auth
    const name = email.split("@")[0] || null;
    try {
      await this.auth.api.signUpEmail({ body: { email, password: tempPassword, name: name ?? email } });
    } catch (e) {
      // Найімовірніше — orphan ba_user від попередньої часткової невдачі. Ловимо голосно: ручне
      // прибирання/ретрай, а не тихий недопровіжений юзер (§tech-plan: edge orphan-ba_user).
      this.logger.warn(
        { err: e instanceof Error ? e.message : String(e), email },
        "members.add: signUpEmail failed (можливий orphan ba_user)",
      );
      throw AppError.unprocessable(
        "Не вдалося створити обліковий запис для цього email (можливо, він уже існує). Зверніться до підтримки.",
      );
    }

    const { userId } = await this.members.insertUser(email, name);
    await this.members.insertMembership(ctx.accountId, userId, role);
    const member = await this.members.memberRow(ctx.accountId, userId);
    return { member: toDTO(member!), tempPassword };
  }

  async changeRole(ctx: AuthCtx, userId: string, roleInput: string): Promise<MemberDTO> {
    const role = roleSchema.parse(roleInput);
    if (userId === ctx.userId) throw AppError.unprocessable("Не можна змінювати власну роль");
    const target = await this.members.memberRow(ctx.accountId, userId);
    if (!target) throw AppError.notFound("member");
    // Захист останнього owner: не знижуємо, якщо він єдиний.
    if (target.role === "owner" && role !== "owner" && (await this.members.countOwners(ctx.accountId)) <= 1) {
      throw AppError.unprocessable("Не можна знизити останнього owner акаунта");
    }
    await this.members.updateRole(ctx.accountId, userId, role);
    const updated = await this.members.memberRow(ctx.accountId, userId);
    return toDTO(updated!);
  }

  async remove(ctx: AuthCtx, userId: string): Promise<void> {
    if (userId === ctx.userId) throw AppError.unprocessable("Не можна видалити себе з акаунта");
    const target = await this.members.memberRow(ctx.accountId, userId);
    if (!target) throw AppError.notFound("member");
    if (target.role === "owner" && (await this.members.countOwners(ctx.accountId)) <= 1) {
      throw AppError.unprocessable("Не можна видалити останнього owner акаунта");
    }
    await this.members.deleteMembership(ctx.accountId, userId);
  }
}

function toDTO(r: { userId: string; email: string; name: string | null; role: string; createdAt: string }): MemberDTO {
  return { userId: r.userId, email: r.email, name: r.name, role: r.role as MemberDTO["role"], createdAt: r.createdAt };
}
