// Публічний вхід для клієнтських компонентів: import { useT, LanguageProvider, LANGUAGES } from "@/lib/i18n".
// Серверні компоненти імпортують getT()/getLanguage() напряму з "@/lib/i18n/server" (окремий
// файл із "server-only", щоб його не можна було випадково затягнути в клієнтський бандл).
export { LanguageProvider, useLanguage, useT } from "./context";
export { translate } from "./translate";
export { DEFAULT_LANGUAGE, LANGUAGES, isLanguage, type Language } from "./types";
