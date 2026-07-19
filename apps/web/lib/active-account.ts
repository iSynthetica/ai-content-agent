"use client";

// Клієнтський запис cookie активного акаунта (spike-3 §5). Ставить AccountSwitcher при виборі.
// Path=/ + SameSite=Lax; НЕ httpOnly — це UI-стан, не транспорт авторизації (тенант-скоуп на
// боці api через сесію + RLS). Серверний layout читає це cookie через next/headers.
import { ACTIVE_ACCOUNT_COOKIE } from "@/lib/auth-constants";

export function setActiveAccountCookie(accountId: string): void {
  if (typeof document === "undefined") return;
  const maxAge = 60 * 60 * 24 * 365; // рік
  document.cookie = `${ACTIVE_ACCOUNT_COOKIE}=${encodeURIComponent(accountId)}; Path=/; Max-Age=${maxAge}; SameSite=Lax`;
}
