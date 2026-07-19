// Дашборд компанії (spike-3 §5, §9). RSC-знімок компанії + список ранів (Paged) → клієнтський
// RunsList бере кермо (Generate + polling статусів). BFF-межа: серверний apiClient б'є в api
// напряму (trusted, §2.2); клієнт далі ходить лише в /api/*.
import { companyDTO } from "@forteq/shared";

import { apiClient } from "@/server/api-client";
import { endpoints } from "@/lib/endpoints";
import { pagedRuns } from "@/features/runs/schemas";
import { RunsList } from "@/features/runs/RunsList";

export const dynamic = "force-dynamic";

export default async function CompanyDashboardPage({
  params,
}: {
  params: Promise<{ companyId: string }>;
}) {
  const { companyId } = await params;

  const [company, runs] = await Promise.all([
    apiClient.get(endpoints.company(companyId), companyDTO),
    apiClient.get(endpoints.runs(companyId), pagedRuns),
  ]);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{company.name}</h1>
        {company.positioning && <p className="text-muted-foreground">{company.positioning}</p>}
      </header>

      <RunsList companyId={companyId} initialRuns={runs.items} />
    </div>
  );
}
