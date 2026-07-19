// Редагування brief/settings існуючої компанії (S-7). RSC prefetch компанії + settings → client
// BriefForm (edit). Settings читаються з GET .../settings (companySettingsDTO), запис — PUT .../settings.
// Settings-fetch толерантний: якщо бек ще не віддає GET, форма стартує з дефолтів (provider+моделі).
import { companyDTO, companySettingsDTO } from "@forteq/shared";

import { apiClient } from "@/server/api-client";
import { endpoints } from "@/lib/endpoints";
import { BriefForm } from "@/features/companies/brief/BriefForm";

export const dynamic = "force-dynamic";

export default async function BriefPage({
  params,
}: {
  params: Promise<{ companyId: string }>;
}) {
  const { companyId } = await params;
  const company = await apiClient.get(endpoints.company(companyId), companyDTO);
  const settings = await apiClient
    .get(endpoints.settings(companyId), companySettingsDTO)
    .catch(() => null);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Бренд-профіль</h1>
        <p className="text-muted-foreground">
          Ці дані визначають, як агенти пишуть контент. Заповнюйте докладно — це впливає на якість.
        </p>
      </header>
      <BriefForm company={company} settings={settings} />
    </div>
  );
}
