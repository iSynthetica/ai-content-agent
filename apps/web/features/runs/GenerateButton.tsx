"use client";

// Generate-кнопка (spike-3 §9): POST створити run → на успіх навігуємо на /runs/:id.
// Помилки (напр. 422 «не сконфігуровано») показує глобальний mutationCache.onError (toast).
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useCreateRun } from "@/features/runs/use-create-run";

export function GenerateButton({
  companyId,
  planEntryIds,
  className,
}: {
  companyId: string;
  planEntryIds?: string[];
  className?: string;
}) {
  const router = useRouter();
  const createRun = useCreateRun(companyId);

  function onGenerate() {
    createRun.mutate(
      { planEntryIds },
      {
        onSuccess: ({ runId }) => {
          toast.success("Прогін запущено");
          router.push(`/runs/${runId}`);
        },
      },
    );
  }

  return (
    <Button onClick={onGenerate} disabled={createRun.isPending} className={className}>
      <Sparkles />
      {createRun.isPending ? "Запускаємо…" : "Згенерувати"}
    </Button>
  );
}
