// Налаштування плану (§2.11, S-20): розклад публікацій, тематичні стовпи, горизонт.
// Початковий конфіг тягнемо на сервері й передаємо у форму — без цього форма змигнула б
// порожньою і затерла б налаштування, якби користувач зберіг її до завантаження даних.
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { apiClient } from "@/server/api-client";
import { endpoints } from "@/lib/endpoints";
import { contentPlanResponse } from "@/lib/dto";
import { PlanConfigForm } from "@/features/planner/PlanConfigForm";

export const dynamic = "force-dynamic";

export default async function PlanSettingsPage({
  params,
}: {
  params: Promise<{ companyId: string }>;
}) {
  const { companyId } = await params;
  const plan = await apiClient
    .get(endpoints.contentPlan(companyId), contentPlanResponse)
    .catch(() => null);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <header className="flex flex-col gap-3">
        <Link
          href={`/companies/${companyId}/plan`}
          className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          До планувальника
        </Link>
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Розклад публікацій</h1>
          <p className="text-muted-foreground">
            Дні виходу по каналах, тематичні стовпи та горизонт планування.
          </p>
        </div>
      </header>

      <PlanConfigForm companyId={companyId} initial={plan?.config ?? null} />
    </div>
  );
}
