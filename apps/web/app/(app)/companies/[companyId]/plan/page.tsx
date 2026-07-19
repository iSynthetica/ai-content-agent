// Календар-планувальник тем (§15). Плейсхолдер Фази 1; повний CalendarBoard (слоти по днях,
// topicMode, backlog-drag, погодження, генерація по обраних) реалізує S-20.
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default async function PlanPage({
  params,
}: {
  params: Promise<{ companyId: string }>;
}) {
  await params;
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Календар</h1>
        <p className="text-muted-foreground">Планування тем по днях і каналах.</p>
      </header>
      <Card>
        <CardHeader>
          <CardTitle>Планувальник у розробці</CardTitle>
          <CardDescription>
            Календар слотів, режими тем (suggest/manual/backlog) і генерація по обраних слотах
            з&apos;являться на наступному етапі.
          </CardDescription>
        </CardHeader>
        <CardContent />
      </Card>
    </div>
  );
}
