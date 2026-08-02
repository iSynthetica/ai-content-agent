// Словник UA → EN. Ключ — оригінальний український рядок з коду (джерело істини — Ukrainian),
// значення — природний продуктовий переклад. t() повертає значення тут, коли мова інтерфейсу —
// англійська; для української й для відсутніх ключів t() повертає ключ без змін (graceful fallback,
// див. apps/web/lib/i18n/translate.ts). Не додавайте сюди мову ГЕНЕРАЦІЇ контенту (GENERATION_LANGUAGES).
export const en: Record<string, string> = {
  // ── App shell (Sidebar / Topbar / MobileNav / NavList / switchers) ─────────
  "Адмінка AI Content Agent": "AI Content Agent admin",
  "Дашборд": "Dashboard",
  "Планувальник": "Planner",
  "Бренд": "Brand",
  "Розклад": "Schedule",
  "Задачі": "Tasks",
  "Перемкнути тему": "Toggle theme",
  "Меню користувача": "User menu",
  "Користувач": "User",
  "Вийти": "Sign out",
  "Відкрити меню": "Open menu",
  "Закрити меню": "Close menu",
  "Сповіщення": "Notifications",
  "задач": "tasks",
  "Потребують дії": "Needs action",
  "Прочитати всі": "Mark all read",
  "Сповіщень немає": "No notifications",
  "Створити компанію": "Create company",
  "Компанія": "Company",
  "Нова компанія": "New company",
  "Акаунт": "Account",
  "Ключі API": "API keys",
};
