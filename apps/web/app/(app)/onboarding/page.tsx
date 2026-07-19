// Онбординг-візард (§13, US-1.1) — плейсхолдер Фази 1. Повний OnboardingWizard (≤2 кроки з
// AI-bootstrap) реалізує S-16. Тут — каркас маршруту, щоб редіректи індексу мали ціль.
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function OnboardingPage() {
  return (
    <div className="mx-auto flex max-w-lg flex-col gap-6 py-10">
      <Card>
        <CardHeader>
          <CardTitle>Створення компанії</CardTitle>
          <CardDescription>
            Онбординг-візард з AI-чернеткою бренд-профілю з&apos;явиться на наступному етапі.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline">
            <Link href="/">На головну</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
