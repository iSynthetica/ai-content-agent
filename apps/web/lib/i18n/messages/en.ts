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

  // ── Auth / login ─────────────────────────────────────────────────────────
  "Не вдалося увійти. Перевірте дані.": "Couldn't sign in. Check your details.",
  "Сервіс входу тимчасово недоступний. Спробуйте ще раз.": "The sign-in service is temporarily unavailable. Please try again.",
  "Вхід у Forteq": "Sign in to Forteq",
  "AI Content Agent — адмінка": "AI Content Agent — admin",
  "Пароль": "Password",
  "Входимо…": "Signing in…",
  "Увійти": "Sign in",
  "Dev-режим (моки): будь-які дані — вхід локальний, без api.": "Dev mode (mocked): any credentials work — sign-in is local, no api call.",

  // ── Onboarding ───────────────────────────────────────────────────────────
  "Два кроки — і можна генерувати контент.": "Two steps, then you're ready to generate content.",
  "Позиціювання": "Positioning",
  "Стек": "Stack",
  "Послуги": "Services",
  "Аудиторія": "Audience",
  "З наявних джерел нічого певного витягти не вдалося — заповніть бриф вручну, це швидко.":
    "We couldn't extract anything definite from the available sources — fill in the brief manually, it's quick.",
  "Компанію створено, але аналіз не запустився — заповніть бриф вручну":
    "Company created, but the analysis didn't start — fill in the brief manually",
  "Не вдалося створити компанію": "Couldn't create the company",
  "Вивчаємо компанію…": "Learning about your company…",
  "Не вдалося проаналізувати": "Couldn't analyze",
  "Готово": "Done",
  "Читаємо джерела й чернетимо бриф. Це займає близько хвилини.":
    "Reading the sources and drafting the brief. This takes about a minute.",
  "Це чернетка — перевірте й виправте її у брифі. Саме бриф стає джерелом правди для перевірки фактів.":
    "This is a draft — review and fix it in the brief. The brief becomes the source of truth for fact-checking.",
  "Аналізуємо…": "Analyzing…",
  "Аналіз не вдався. Заповніть бриф вручну.": "Analysis failed. Fill in the brief manually.",
  "До брифу": "Go to brief",
  "Пропустити й заповнити вручну": "Skip and fill in manually",
  "Розкажіть про компанію": "Tell us about your company",
  "Потрібні лише назва та сайт (або опис одним рядком). Решту брифу ми зчернетимо самі.":
    "We only need a name and a website (or a one-line description). We'll draft the rest of the brief for you.",
  "Назва компанії": "Company name",
  "Сайт": "Website",
  "Або опишіть одним рядком": "Or describe it in one line",
  "Робимо інтеграційні сервіси на TypeScript для середнього бізнесу":
    "We build integration services in TypeScript for mid-market companies",
  "Досить чогось одного — сайту або опису.": "Just one of these is enough — a website or a description.",
  "Створити й проаналізувати": "Create and analyze",
};
