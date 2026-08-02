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

  // ── Company brief / settings ─────────────────────────────────────────────
  "Мова інтерфейсу": "Interface language",
  "Мова меню, кнопок і повідомлень застосунку. Не впливає на мову згенерованого контенту.":
    "The language of menus, buttons, and app messages. Does not affect the language of generated content.",
  "Бренд-профіль": "Brand profile",
  "Ці дані визначають, як агенти пишуть контент. Заповнюйте докладно — це впливає на якість.":
    "This data shapes how the agents write content. Fill it in thoroughly — it affects quality.",
  "Бренд-профіль збережено": "Brand profile saved",
  "Базові дані про бізнес — саме на них спираються агенти при генерації.":
    "Basic business information — the agents rely on this when generating content.",
  "Назва*": "Name*",
  "CTO та продуктові команди B2B SaaS": "CTOs and product teams at B2B SaaS companies",
  "Позиціонування": "Positioning",
  "Одним-двома реченнями: чим ви корисні й для кого.": "One or two sentences: how you help, and who for.",
  "Приклад: «Будуємо надійні AI-продукти під ключ для B2B».": "Example: \"We build reliable, turnkey AI products for B2B.\"",
  "Короткий опис": "Short description",
  "Команда, що будує продукти й AI-агентів.": "A team that builds products and AI agents.",
  "Через кому.": "Comma-separated.",
  "Розробка MVP, AI-інтеграції, аудит": "MVP development, AI integrations, audits",
  "Провайдери та ключі": "Providers and keys",
  "Введіть API-ключ будь-якого або кількох провайдерів. Генерація йде на ваш ключ; роль без ключа обраного провайдера блокує прогін. Ключі спільні для всіх компаній акаунта.":
    "Enter an API key for one or more providers. Generation runs on your key; a role without a key for the chosen provider blocks the run. Keys are shared across all companies in the account.",
  "Бренд і генерація": "Brand and generation",
  "Тон, стиль і дефолти LLM для генерації контенту.": "Tone, style, and LLM defaults for content generation.",
  "Тон голосу": "Tone of voice",
  "Експертно-дружній, без жаргону та маркетингового шуму.": "Expert yet friendly, no jargon and no marketing fluff.",
  "Приклади тону": "Tone examples",
  "Ми будуємо, а не обіцяємо.\nСкладне — простими словами.": "We build, not promise.\nComplex things, explained simply.",
  "По одному прикладу на рядок.": "One example per line.",
  "Візуальний стиль": "Visual style",
  "Мінімалізм, синій акцент, багато повітря": "Minimalist, blue accent, plenty of whitespace",
  "Заборонені фрази": "Forbidden phrases",
  "революційний, унікальна пропозиція": "revolutionary, unique selling proposition",
  "Через кому — їх агенти уникатимуть.": "Comma-separated — the agents will avoid these.",
  "Мова контенту": "Content language",
  "Моделі AI": "AI models",
  "Провайдер і моделі per-agent для пайплайна генерації. Зображення завжди генерує OpenAI.":
    "Provider and per-agent models for the generation pipeline. Images are always generated by OpenAI.",
  "Скинути до дефолтів": "Reset to defaults",
  "Провайдер": "Provider",
  "Зміна провайдера скидає текстові моделі на його розумні дефолти.":
    "Changing the provider resets the text models to its smart defaults.",
  "Текстові моделі (per-agent)": "Text models (per agent)",
  "Візуал (зображення)": "Visual (images)",
  "Модель під кожну роль (розширено)": "Model per role (advanced)",
  "Зберігаємо…": "Saving…",
  "Зберегти": "Save",
  "Є незбережені зміни": "You have unsaved changes",
  "Дослідник": "Researcher",
  "Стратег": "Strategist",
  "Автор": "Writer",
  "Рецензент": "Reviewer",
  "Суддя (evaluation)": "Judge (evaluation)",
  "За замовчуванням усі ролі працюють на базовому провайдері вище. Тут можна перевизначити провайдера й модель окремо для кожної ролі (напр. дослідник на Gemini, автор на Claude).":
    "By default all roles run on the base provider above. Here you can override the provider and model separately for each role (e.g. researcher on Gemini, writer on Claude).",
  "За замовчуванням": "Default",
  " — немає ключа": " — no key",
  "Додайте ключ": "Add a",
  "вище, інакше прогін не запуститься.": "key above, otherwise the run won't start.",
  "Вкажіть назву компанії": "Enter a company name",
  "Некоректний URL (приклад: https://forteq.systems)": "Invalid URL (example: https://forteq.systems)",

  // ── Planner pages / account settings ─────────────────────────────────────
  "Спершу слоти й теми, потім генерація — план можна переглянути до того, як витрачені гроші на модель.":
    "Slots and topics first, then generation — you can review the plan before any model spend.",
  "До планувальника": "Back to planner",
  "Розклад публікацій": "Publishing schedule",
  "Дні виходу по каналах, тематичні стовпи та горизонт планування.":
    "Publishing days per channel, topic pillars, and the planning horizon.",
  "Свій ключ провайдера на акаунт: генерація оплачується вашим ключем. Без ключа потрібного провайдера прогони не запускаються.":
    "One provider key per account: generation is billed to your key. Without a key for the required provider, runs won't start.",
  "Керувати ключами можуть лише власник і адміністратор акаунта.":
    "Only the account owner and admin can manage keys.",

  // ── Planner board ─────────────────────────────────────────────────────────
  "Без дати": "No date",
  "Не вдалося зберегти тему": "Couldn't save the topic",
  "Тема поста": "Post topic",
  "Ключове повідомлення": "Key message",
  "Скасувати": "Cancel",
  "Тема ще не підібрана — натисніть «Підібрати теми» або впишіть свою":
    "No topic picked yet — click \"Suggest topics\" or write your own",
  "Додано слотів": "Slots added",
  "Нових слотів немає — план уже покриває горизонт": "No new slots — the plan already covers the horizon",
  "Не вдалося оновити план": "Couldn't update the plan",
  "Погоджено": "Approved",
  "із": "of",
  "решта вже змінили статус": "the rest already changed status",
  "Не вдалося погодити слоти": "Couldn't approve the slots",
  "Оновити слоти": "Refresh slots",
  "Підібрати теми": "Suggest topics",
  "Погодити всі": "Approve all",
  "Завантаження…": "Loading…",
  "Слотів ще немає": "No slots yet",
  "Налаштуйте розклад публікацій у конфігурації плану, потім натисніть «Оновити слоти» — вони з’являться на горизонті планування.":
    "Set up the publishing schedule in the plan configuration, then click \"Refresh slots\" — they'll appear within the planning horizon.",

  // ── Plan config form ─────────────────────────────────────────────────────
  "Пн": "Mon",
  "Вт": "Tue",
  "Ср": "Wed",
  "Чт": "Thu",
  "Пт": "Fri",
  "Сб": "Sat",
  "Нд": "Sun",
  "Блог": "Blog",
  "Горизонт має бути додатним числом тижнів": "The horizon must be a positive number of weeks",
  "Розклад збережено": "Schedule saved",
  "Не вдалося зберегти розклад": "Couldn't save the schedule",
  "Дні тижня, у які виходить контент кожного каналу. З цього розкладу планувальник створює порожні слоти на горизонт планування.":
    "The days of the week each channel publishes on. The planner uses this schedule to create empty slots for the planning horizon.",
  "тиждень": "week",
  "періодично": "periodic",
  "не публікуємо": "not publishing",
  "Налаштовано окремим правилом: раз на": "Configured with a separate rule: every",
  "тиж.": "wk",
  "Вибір днів нижче його замінить.": "Picking days below will replace it.",
  "Не обрано жодного дня — планувальник не зможе створити слоти.":
    "No day is selected — the planner won't be able to create slots.",
  "Теми й горизонт": "Topics and horizon",
  "Стовпи задають тематичні напрями, у межах яких підбираються теми.":
    "Pillars define the topic areas that topics are picked from.",
  "Тематичні стовпи": "Topic pillars",
  "архітектура, DevOps, кейси клієнтів": "architecture, DevOps, customer case studies",
  "Горизонт планування, тижнів": "Planning horizon, weeks",
  "На скільки тижнів наперед створюються слоти. Орієнтовно": "How many weeks ahead slots are created. Approximately",
  "слотів.": "slots.",
  "Зберегти розклад": "Save schedule",

  // ── Status labels (lib/status.ts, translated at the StatusBadge render site) ─
  "У черзі": "Queued",
  "Виконується": "Running",
  "На рецензії": "In review",
  "Схвалено": "Approved",
  "Відхилено": "Rejected",
  "Помилка": "Failed",
  "Чернетка": "Draft",
  "Потребує правок": "Needs revision",
  "Запропоновано": "Proposed",
  "Заплановано": "Scheduled",
  "Генерується": "Generating",
  "Згенеровано": "Generated",
  "Пропущено": "Skipped",
  "Порушення": "Violations",

  // ── Channel / score / violations panels ──────────────────────────────────
  "Оцінок ще немає.": "No scores yet.",
  "Тон": "Tone",
  "Конкретність": "Specificity",
  "Фактичність": "Factual accuracy",
  "Відповідність каналу": "Channel fit",
  "Чому": "Why",
  "Порушень не виявлено": "No violations found",

  // ── Run card / content item card / post body / rerun dialog ─────────────
  "Постів": "Posts",
  "Не вдалося скопіювати": "Couldn't copy",
  "Скопіювати текст": "Copy text",
  "Скопійовано": "Copied",
  "Копіювати": "Copy",
  "Згенероване зображення": "Generated image",
  "Зображення генерується…": "Generating image…",
  "Текст ще генерується…": "Text is still generating…",
  "Оцінки Reviewer’а": "Reviewer scores",
  "Схвалити": "Approve",
  "Відхилити": "Reject",
  "Перегенерувати": "Regenerate",
  "Перегенерувати пост": "Regenerate post",
  "Пост піде на нову ітерацію (needs_revision). Можна додати інструкцію для Writer'а.":
    "The post will go through another iteration (needs_revision). You can add instructions for the Writer.",
  "Згорнути": "Collapse",
  "Читати повністю": "Read in full",
  "символів": "characters",
  "Інструкція (необовʼязково)": "Instructions (optional)",
  "Що саме змінити у наступній ітерації? Напр.: «прибрати заклики до дії, додати конкретику».":
    "What exactly should change in the next iteration? E.g. \"remove calls to action, add more specifics.\"",
  "Відправляємо…": "Sending…",

  // ── Pipeline flow ─────────────────────────────────────────────────────────
  "Візуал": "Visual",
  "Рев'ю людини": "Human review",
  "Очікує": "Pending",
  "ревізія": "revision",
  "умовний": "conditional",
  "Пайплайн": "Pipeline",
  "Завершено": "Completed",
  "Зараз": "Now",
  "Очікує на старт": "Waiting to start",

  // ── Channel tabs / export menu ───────────────────────────────────────────
  "Канали": "Channels",
  "є порушення": "has violations",
  "Для цього каналу ще немає постів.": "No posts for this channel yet.",
  "Експорт": "Export",

  // ── API keys manager ──────────────────────────────────────────────────────
  "Потрібен для генерації тексту й зображень (gpt-image-1).": "Required for generating text and images (gpt-image-1).",
  "Потрібен, лише якщо в налаштуваннях обрано Claude.": "Required only if Claude is selected in settings.",
  "Потрібен, лише якщо в налаштуваннях обрано Gemini.": "Required only if Gemini is selected in settings.",
  "Ключ виглядає надто коротким": "The key looks too short",
  "ключ збережено": "key saved",
  "ключ видалено": "key deleted",
  "Налаштовано": "Configured",
  "Не налаштовано": "Not configured",
  "Замінити ключ": "Replace key",
  "Додати ключ": "Add key",
  "Видалити ключ": "Delete key",

  // ── Inbox ─────────────────────────────────────────────────────────────────
  "Дії, що потребують вашої уваги.": "Actions that need your attention.",
  "Немає задач": "No tasks",
  "Коли прогін завершиться і пости чекатимуть на рецензію, задача з’явиться тут.":
    "Once a run finishes and posts are waiting for review, the task will show up here.",
  "Перейти": "Open",
  "Виконано": "Done",

  // ── Runs list / generate button ──────────────────────────────────────────
  "Прогони генерації": "Generation runs",
  "Запустіть генерацію та стежте за статусами прогонів у реальному часі.":
    "Start a generation and watch run statuses update in real time.",
  "Не вдалося завантажити прогони. Спробуйте оновити сторінку.":
    "Couldn't load runs. Try refreshing the page.",
  "Ще немає прогонів": "No runs yet",
  "Перед першою генерацією заповніть бренд-профіль і налаштуйте контент-план — на них спираються агенти.":
    "Before your first generation, fill in the brand profile and set up the content plan — the agents rely on them.",
  "Заповнити бренд-профіль": "Fill in the brand profile",
  "Відкрити планувальник": "Open the planner",
  "Згенерувати": "Generate",

  // ── Run config dialog ─────────────────────────────────────────────────────
  "Прогін запущено": "Run started",
  "Налаштування прогону": "Run configuration",
  "Перевірка перед запуском": "Review before starting",
  "Закрити": "Close",
  "обраних слотів із календаря. Теми й канали беруться зі слотів.":
    "selected slots from the calendar. Topics and channels come from the slots.",
  "Кількість постів": "Number of posts",
  "Теми": "Topics",
  "AI обере теми": "AI picks the topics",
  "Вписати вручну": "Enter manually",
  "По одній темі на рядок. Скільки тем — стільки постів (точна кількість).":
    "One topic per line. As many posts as topics (exact count).",
  "Тема 1\nТема 2": "Topic 1\nTopic 2",
  "Акцент / кут кампанії (необов’язково)": "Campaign angle (optional)",
  "напр. фокус на економії часу для DevOps-команд": "e.g. focus on time savings for DevOps teams",
  "Моделі під ролі (необов’язково — інакше за налаштуваннями)": "Models per role (optional — otherwise follows settings)",
  "Разом": "Total",
  "постів": "posts",
  "максимум": "maximum",
  "на прогін": "per run",
  "Що буде згенеровано": "What will be generated",
  "слотів із календаря.": "slots from the calendar.",
  "ваші теми": "your topics",
  "теми обере AI": "AI picks the topics",
  "Акцент": "Angle",
  "Моделі": "Models",
  "за збереженими налаштуваннями компанії": "using the company's saved settings",
  "Орієнтовна вартість — типово ≈ $0.07 на gpt-5-nano; сильніші моделі дорожчі. Точна вартість зʼявиться після прогону. Генерація йде на ваш API-ключ (BYOK).":
    "Estimated cost — typically ≈ $0.07 on gpt-5-nano; stronger models cost more. The exact cost appears after the run. Generation runs on your API key (BYOK).",
  "Не вдалося запустити прогін": "Couldn't start the run",
  "Назад": "Back",
  "Далі": "Next",
  "Запускаємо…": "Starting…",
  "Запустити генерацію": "Start generation",

  // ── Run detail page ───────────────────────────────────────────────────────
  "До компанії": "Back to company",
  "Прогін": "Run",
  "Конфігурація": "Configuration",
  "з календаря (обрані слоти)": "from the calendar (selected slots)",
  "акцент": "angle",
  "моделі": "models",
  "У черзі на генерацію…": "Queued for generation…",
  "Агенти працюють над контентом. Картки з'являтимуться поступово.":
    "The agents are working on the content. Cards will appear as they're ready.",
  "Прогін завершився помилкою": "The run failed",
  "Можна повторити генерацію з тими самими налаштуваннями компанії.":
    "You can retry generation with the same company settings.",
  "Прогін очікує на ваше рішення": "The run is waiting for your decision",
  "Потребують уваги": "Need attention",
  "Перегляньте пости нижче й ухваліть рішення по всьому прогону.":
    "Review the posts below and make a decision for the whole run.",
  "Схвалити прогін": "Approve run",
  "Відхилити прогін": "Reject run",
  "Не вдалося оновити статус прогону. Дані можуть бути неактуальними.":
    "Couldn't refresh the run status. Data may be out of date.",
  "У цьому прогоні ще немає постів.": "No posts in this run yet.",
  "Перегенерувати прогін": "Regenerate run",
  "Прогін піде на нову ітерацію. Можна додати спільну інструкцію для агентів.":
    "The run will go through another iteration. You can add a shared instruction for the agents.",

  // ── Post editing + version history (§content-editing) ────────────────────
  "Редагувати": "Edit",
  "Заголовок (необовʼязково)": "Title (optional)",
  "Текст поста не може бути порожнім": "The post text can't be empty",
  "Пост збережено": "Post saved",
  "Не вдалося зберегти правку": "Couldn't save the edit",
  "Історія": "History",
  "Історія версій": "Version history",
  "Історія версій ще порожня.": "No versions yet.",
  "Людська правка": "Human edit",
  "Поточна": "Current",
  "Відновити цю версію": "Restore this version",
  "Відновлюємо…": "Restoring…",
  "Пост відновлено до обраної версії": "Post restored to the selected version",
  "Не вдалося відновити версію": "Couldn't restore the version",

  // ── Global error fallbacks (BFF proxy, query client, api-error) ─────────
  "Сталася непередбачена помилка. Спробуйте ще раз.": "An unexpected error occurred. Please try again.",
  "Сталася помилка. Спробуйте ще раз.": "Something went wrong. Please try again.",
  "Сервіс генерації тимчасово недоступний. Спробуйте ще раз.": "The generation service is temporarily unavailable. Please try again.",
  "Ресурс не знайдено.": "Resource not found.",
};
