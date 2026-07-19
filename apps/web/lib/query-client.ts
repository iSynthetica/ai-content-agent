"use client";

// Налаштований QueryClient (spike-3 §8.1). Глобальний обробник помилок:
//   401/UNAUTHORIZED → редірект на /login (сесія протухла/відсутня);
//   інше → toast з людським ApiError.message (NFR-3.2).
import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ApiError, isAuthError } from "@/lib/api-error";

function handleGlobalError(error: unknown) {
  if (isAuthError(error)) {
    if (typeof window !== "undefined") {
      const next = encodeURIComponent(window.location.pathname + window.location.search);
      window.location.assign(`/login?next=${next}`);
    }
    return;
  }
  const message =
    error instanceof ApiError ? error.message : "Сталася помилка. Спробуйте ще раз.";
  toast.error(message);
}

export function makeQueryClient(): QueryClient {
  return new QueryClient({
    queryCache: new QueryCache({ onError: handleGlobalError }),
    mutationCache: new MutationCache({ onError: handleGlobalError }),
    defaultOptions: {
      queries: {
        staleTime: 30_000, // доменні дані рідко міняються поза нашими мутаціями
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: false,
        retry: (count, err) => !isAuthError(err) && count < 2,
      },
      mutations: { retry: 0 },
    },
  });
}
