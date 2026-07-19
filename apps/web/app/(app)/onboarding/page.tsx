// Онбординг-візард (§6 раунд 2, S-16) — два кроки: мінімальні дані, потім AI-чернетка брифу.
import { OnboardingWizard } from "@/features/onboarding/OnboardingWizard";

export default function OnboardingPage() {
  return (
    <div className="mx-auto flex max-w-lg flex-col gap-6 py-10">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Нова компанія</h1>
        <p className="text-muted-foreground">Два кроки — і можна генерувати контент.</p>
      </header>
      <OnboardingWizard />
    </div>
  );
}
