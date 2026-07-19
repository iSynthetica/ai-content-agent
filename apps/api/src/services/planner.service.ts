// Планувальник (§2.11 раунд 2). Відповідає за СЛОТИ, не за контент: коли і в який канал ми
// публікуємо. Наповнення слотів темами — окрема job (planner.suggest_topics), запуск генерації —
// окремий прогін, скоупнутий на обрані слоти.
import { AppError } from "../http/errors";
import type { AuthCtx } from "../di/types";
import type {
  CompaniesRepo,
  ContentPlansRepo,
  NewPlanEntry,
  PlanEntriesRepo,
  PlanEntry,
  PlanEntryPatch,
} from "../repositories/interfaces";
import { contentPlanConfig } from "@forteq/shared";
import { excludeExisting, materializeSlots, type Cadence } from "../lib/materialize";

const DEFAULT_HORIZON_WEEKS = 4;

export class PlannerService {
  constructor(
    private readonly entries: PlanEntriesRepo,
    private readonly plans: ContentPlansRepo,
    private readonly companies: CompaniesRepo,
  ) {}

  private async requirePlan(ctx: AuthCtx, companyId: string) {
    const company = await this.companies.findById(ctx.accountId, companyId);
    if (!company) throw AppError.notFound("company");
    const plan = await this.plans.getByCompany(ctx.accountId, companyId);
    if (!plan) throw AppError.notFound("content plan");
    return plan;
  }

  async list(
    ctx: AuthCtx,
    companyId: string,
    range: { from?: string; to?: string },
  ): Promise<PlanEntry[]> {
    await this.requirePlan(ctx, companyId);
    return this.entries.listByCompany(ctx.accountId, companyId, range);
  }

  /**
   * Розкладає cadence у порожні датовані слоти на горизонті.
   *
   * `today` приходить аргументом, а не з `new Date()` усередині: це робить операцію
   * відтворюваною і тестованою, і дозволяє матеріалізувати план наперед від довільної дати.
   *
   * Ідемпотентна: повторний виклик не дублює вже наявні слоти (excludeExisting). Це не оптимізація —
   * горизонт зсувається щотижня, і користувач тисне «оновити план» багато разів.
   */
  async materialize(
    ctx: AuthCtx,
    companyId: string,
    opts: { horizonWeeks?: number; today: string },
  ): Promise<{ created: number; skipped: number }> {
    const plan = await this.requirePlan(ctx, companyId);

    // config лежить у jsonb як довільний об'єкт — розбираємо схемою, а не кастом: у базі може
    // опинитись усе що завгодно (стара форма, ручна правка), і мовчазний каст дав би збій
    // десь глибше, замість зрозумілої помилки тут.
    const parsed = contentPlanConfig.partial().safeParse(plan.config ?? {});
    const config = parsed.success ? parsed.data : {};
    const cadence = (config.cadence ?? {}) as Cadence;
    if (Object.keys(cadence).length === 0) {
      // Без cadence матеріалізувати нічого — і це помилка конфігурації, а не порожній результат.
      // Мовчазний успіх тут виглядав би як «план оновлено», хоча не з'явилось нічого.
      throw AppError.badRequest("content plan has no cadence configured");
    }

    const horizonWeeks =
      opts.horizonWeeks ?? config.planningHorizonWeeks ?? DEFAULT_HORIZON_WEEKS;

    const wanted = materializeSlots({ cadence, from: opts.today, horizonWeeks });
    const existing = await this.entries.listDatedKeys(ctx.accountId, companyId);
    const fresh = excludeExisting(wanted, existing);

    const rows: NewPlanEntry[] = fresh.map((s) => ({
      companyId,
      contentPlanId: plan.id,
      date: s.date,
      channel: s.channel,
      source: "ai_suggested",
    }));

    const created = await this.entries.insertMany(ctx.accountId, rows);
    return { created, skipped: wanted.length - fresh.length };
  }

  async patchEntry(ctx: AuthCtx, id: string, patch: PlanEntryPatch): Promise<PlanEntry> {
    const existing = await this.entries.findById(ctx.accountId, id);
    if (!existing) throw AppError.notFound("plan entry");
    // Редагувати тему слота, який уже пішов у генерацію, пізно: прогін працює зі знімком,
    // і правка створювала б розбіжність між планом і згенерованим постом.
    if (existing.status === "generating" || existing.status === "generated") {
      throw AppError.conflict("plan entry is already in generation");
    }
    const updated = await this.entries.patch(ctx.accountId, id, patch);
    if (!updated) throw AppError.notFound("plan entry");
    return updated;
  }

  /**
   * Погодження слотів перед генерацією. Повертає, скільки реально перейшло у `approved`:
   * розбіжність означає, що частина слотів була не в `proposed` (уже погоджені чи згенеровані),
   * і UI має це показати, а не вдавати повний успіх.
   */
  async approve(ctx: AuthCtx, ids: string[]): Promise<{ approved: number; requested: number }> {
    const approved = await this.entries.approve(ctx.accountId, ids);
    return { approved, requested: ids.length };
  }
}
