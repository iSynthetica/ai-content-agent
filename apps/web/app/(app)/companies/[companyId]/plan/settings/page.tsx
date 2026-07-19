// Налаштування плану (§15): cadence/pillars/horizon/topicMode/auto*. Плейсхолдер Фази 1; повна
// PlanConfigForm (rhf+zod-дзеркало ContentPlanConfig, «Матеріалізувати слоти») реалізує S-20.
// Хук use-update-plan-config (WEB-7) уже готовий і живить цю форму.
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default async function PlanSettingsPage({
  params,
}: {
  params: Promise<{ companyId: string }>;
}) {
  await params;
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Налаштування плану</h1>
        <p className="text-muted-foreground">Розклад, тематичні стовпи й режим підбору тем.</p>
      </header>
      <Card>
        <CardHeader>
          <CardTitle>Config у розробці</CardTitle>
          <CardDescription>
            Форма конфігурації плану з&apos;явиться на наступному етапі. Мутація збереження
            (use-update-plan-config) уже підготовлена.
          </CardDescription>
        </CardHeader>
        <CardContent />
      </Card>
    </div>
  );
}
