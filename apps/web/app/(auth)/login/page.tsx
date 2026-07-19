"use client";

// Логін (spike-3 §7). Клієнтська форма → прямий fetch POST /api/auth/sign-in (той самий origin) →
// BFF-форвард → api /v1/auth/sign-in (кастомна обгортка Better Auth): 200 + sessionResponse і
// сесійний cookie через passthrough Set-Cookie на origin web. Редірект після успіху — на
// safeNext(next) (захист від open-redirect; дефолт "/"). У dev-моках (NEXT_PUBLIC_MOCK_API=1) api
// немає — ставимо сесійний cookie локально й ідемо далі.
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { safeNext } from "@/lib/safe-next";
import { SESSION_COOKIE } from "@/lib/auth-constants";

const MOCK = process.env.NEXT_PUBLIC_MOCK_API === "1";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const dest = safeNext(searchParams.get("next"));

  const [email, setEmail] = useState(MOCK ? "owner@forteq.systems" : "");
  const [password, setPassword] = useState(MOCK ? "demo" : "");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      if (MOCK) {
        document.cookie = `${SESSION_COOKIE}=mock-session; Path=/; SameSite=Lax`;
      } else {
        const res = await fetch("/api/auth/sign-in", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ email, password }),
          credentials: "include", // сесійний cookie — на origin web через passthrough Set-Cookie
        });
        if (!res.ok) {
          // BFF нормалізує помилку api у envelope { error: { code, message } }.
          let message = "Не вдалося увійти. Перевірте дані.";
          try {
            const data = (await res.json()) as { error?: { message?: string } };
            if (data?.error?.message) message = data.error.message;
          } catch {
            /* тіло не JSON — лишаємо дефолтний меседж */
          }
          setError(message);
          setPending(false);
          return;
        }
      }
      router.push(dest);
      router.refresh();
    } catch {
      setError("Сервіс входу тимчасово недоступний. Спробуйте ще раз.");
      setPending(false);
    }
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader className="items-center text-center">
        <Sparkles className="h-6 w-6 text-primary" />
        <CardTitle className="text-xl">Вхід у Forteq</CardTitle>
        <CardDescription>AI Content Agent — адмінка</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="username"
              placeholder="you@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="password">Пароль</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          {error && <p className="text-sm font-medium text-destructive">{error}</p>}
          <Button type="submit" disabled={pending} className="w-full">
            {pending ? "Входимо…" : "Увійти"}
          </Button>
          {MOCK && (
            <p className="text-center text-xs text-muted-foreground">
              Dev-режим (моки): будь-які дані — вхід локальний, без api.
            </p>
          )}
        </form>
      </CardContent>
    </Card>
  );
}

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
    </main>
  );
}
