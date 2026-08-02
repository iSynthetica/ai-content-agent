// Ім'я сесійного cookie — фіксоване й спільне з api (spike-3 §5). Better Auth за
// замовчуванням іменує session cookie так; у prod із префіксом __Secure- при Secure.
// Middleware перевіряє ПРИСУТНІСТЬ цього cookie (дешевий бар'єр), server/auth.ts — валідність.
export const SESSION_COOKIE = "better-auth.session_token";

// UI-контекст обраного акаунта (spike-3 §5). НЕ httpOnly — це не секрет, а навігаційний стан.
export const ACTIVE_ACCOUNT_COOKIE = "activeAccountId";

// Мова інтерфейсу (НЕ мова генерації контенту — та живе в @forteq/shared GENERATION_LANGUAGES і
// зберігається в компанії). UI-стан, як activeAccountId — НЕ httpOnly, без DB-звʼязку, працює
// однаково для всіх акаунтів/компаній. Дефолт (відсутнє cookie) — англійська.
export const UI_LANGUAGE_COOKIE = "uiLanguage";
