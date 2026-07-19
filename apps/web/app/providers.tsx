"use client";

// Клієнтські провайдери додатку: серверний стан (TanStack Query) + тема (next-themes).
// QueryClient створюємо через useState, щоб інстанс був стабільний між ре-рендерами
// і не ділився між запитами на сервері. Налаштування (defaults + global onError) — у
// lib/query-client.ts (spike-3 §8.1): 401 → редірект на /login, інше → toast.
import { QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { useState, type ReactNode } from "react";

import { makeQueryClient } from "@/lib/query-client";

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(makeQueryClient);

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider
        attribute="class"
        defaultTheme="system"
        enableSystem
        disableTransitionOnChange
      >
        {children}
      </ThemeProvider>
    </QueryClientProvider>
  );
}
