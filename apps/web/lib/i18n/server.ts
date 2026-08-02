import "server-only";
import { cookies } from "next/headers";

import { UI_LANGUAGE_COOKIE } from "@/lib/auth-constants";

import { translate } from "./translate";
import { DEFAULT_LANGUAGE, isLanguage, type Language } from "./types";

// Серверний еквівалент useLanguage()/useT() — для server components (app/**/page.tsx), які й досі
// рендерять текст напряму (наприклад заголовки сторінок). Читає те саме cookie, що й клієнтський
// LanguageProvider, тож перший рендер завжди узгоджений (без гідраційного мисматчу).
export async function getLanguage(): Promise<Language> {
  const store = await cookies();
  const value = store.get(UI_LANGUAGE_COOKIE)?.value;
  return isLanguage(value) ? value : DEFAULT_LANGUAGE;
}

export async function getT(): Promise<(source: string) => string> {
  const language = await getLanguage();
  return (source: string) => translate(language, source);
}
