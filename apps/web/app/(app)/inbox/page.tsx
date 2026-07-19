// Inbox — actionable-задачі (§2.13, S-18): прогони на рецензію, невдалі генерації.
// Клієнтський список з polling 15с — задачі народжуються ФОНОВО (worker), тож сторінка має
// оновлюватись сама, інакше нова задача не з'явиться без перезавантаження.
import { InboxList } from "@/features/notifications/InboxList";

export default function InboxPage() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Задачі</h1>
        <p className="text-muted-foreground">Дії, що потребують вашої уваги.</p>
      </header>
      <InboxList />
    </div>
  );
}
