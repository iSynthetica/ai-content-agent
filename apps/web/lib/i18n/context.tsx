"use client";

// Клієнтський LanguageProvider (дзеркалить ThemeProvider/next-themes у app/providers.tsx). Дістає
// initialLanguage від серверного RootLayout (cookie вже прочитане там — без гідраційного мисматчу),
// тримає його в стані для миттєвого читання через useT()/useLanguage(). Зміна мови пише cookie й
// перезавантажує сторінку — так сервер-компоненти (page.tsx-заголовки) теж підхоплюють нову мову,
// без ручної синхронізації RSC-пропсів після router.refresh().
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

import { UI_LANGUAGE_COOKIE } from "@/lib/auth-constants";

import { translate } from "./translate";
import type { Language } from "./types";

interface LanguageContextValue {
  language: Language;
  setLanguage: (language: Language) => void;
  t: (source: string) => string;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({
  initialLanguage,
  children,
}: {
  initialLanguage: Language;
  children: ReactNode;
}) {
  const [language, setLanguageState] = useState<Language>(initialLanguage);

  const setLanguage = useCallback((next: Language) => {
    if (typeof document !== "undefined") {
      const maxAge = 60 * 60 * 24 * 365; // рік, як activeAccountId
      document.cookie = `${UI_LANGUAGE_COOKIE}=${next}; Path=/; Max-Age=${maxAge}; SameSite=Lax`;
    }
    setLanguageState(next);
    // Повний релоад, а не router.refresh(): цей провайдер — клієнтський компонент, змонтований
    // один раз у RootLayout; router.refresh() перечитує server components, але не пересоздає це
    // дерево з новим initialLanguage. Релоад гарантує узгоджений первинний рендер усюди.
    if (typeof window !== "undefined") window.location.reload();
  }, []);

  const t = useCallback((source: string) => translate(language, source), [language]);

  const value = useMemo(() => ({ language, setLanguage, t }), [language, setLanguage, t]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLanguage must be used within LanguageProvider");
  return ctx;
}

// Найчастіший випадок — потрібна лише функція перекладу.
export function useT(): (source: string) => string {
  return useLanguage().t;
}
