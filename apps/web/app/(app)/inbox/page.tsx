// Inbox — actionable-задачі (§2.13, S-18): прогони на рецензію, невдалі генерації.
// Клієнтський список з polling 15с — задачі народжуються ФОНОВО (worker), тож сторінка має
// оновлюватись сама, інакше нова задача не з'явиться без перезавантаження.
import { InboxList } from "@/features/notifications/InboxList";
import { getT } from "@/lib/i18n/server";

export default async function InboxPage() {
  const t = await getT();
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t("Задачі")}</h1>
        <p className="text-muted-foreground">{t("Дії, що потребують вашої уваги.")}</p>
      </header>
      <InboxList />
    </div>
  );
}
