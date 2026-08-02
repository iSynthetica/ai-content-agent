// Парсер мови UI із СИРОГО Cookie-заголовка. НЕ "server-only" — свідомо: цей helper
// використовується і на сервері (Route Handler / BFF-проксі має лише req.headers.get("cookie"),
// не next/headers) і в браузері (document.cookie), тож один парсер рядка покриває обидва боки без
// дублювання regex-у. Для React-дерева використовуйте useLanguage()/getT() — це для країв поза ним
// (lib/api-error.ts, server/proxy.ts, app/api/[...proxy]/route.ts, lib/query-client.ts).
import { UI_LANGUAGE_COOKIE } from "@/lib/auth-constants";

import { DEFAULT_LANGUAGE, isLanguage, type Language } from "./types";

export function languageFromCookieHeader(cookieHeader: string | null | undefined): Language {
  if (!cookieHeader) return DEFAULT_LANGUAGE;
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${UI_LANGUAGE_COOKIE}=([^;]+)`));
  const value = match ? decodeURIComponent(match[1]) : undefined;
  return isLanguage(value) ? value : DEFAULT_LANGUAGE;
}

// Зручний варіант для браузера (клієнтський QueryClient, http.ts) — читає document.cookie напряму.
export function languageFromDocumentCookie(): Language {
  if (typeof document === "undefined") return DEFAULT_LANGUAGE;
  return languageFromCookieHeader(document.cookie);
}
