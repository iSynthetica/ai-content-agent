"use client";

// Онбординг-візард (§6 раунд 2, S-17) — ДВА кроки, і це вимога, а не оформлення.
//
// Обов'язкове лише: назва + сайт АБО опис одним рядком. Усе інше чернетить AI, а людина
// виправляє вже в брифі. Форма на 15 полів перед першою генерацією — головна причина, чому до
// цієї генерації не доходять.
import * as React from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowRight, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  useBootstrapStatus,
  useCreateCompany,
  useStartBootstrap,
} from "@/features/onboarding/use-onboarding";

function ProfilePreview({ profile }: { profile: Record<string, unknown> }) {
  const rows: Array<[string, string]> = [];
  const push = (label: string, v: unknown) => {
    if (Array.isArray(v) && v.length > 0) rows.push([label, v.join(", ")]);
    else if (typeof v === "string" && v.trim()) rows.push([label, v]);
  };
  push("Позиціювання", profile.positioning);
  push("Стек", profile.stack);
  push("Послуги", profile.services);
  push("Аудиторія", profile.audience);

  if (rows.length === 0) {
    // Bootstrap завершився, але нічого не витяг. Кажемо прямо: інакше порожній екран читався б
    // як помилка завантаження, і людина чекала б далі.
    return (
      <p className="text-sm text-muted-foreground">
        З наявних джерел нічого певного витягти не вдалося — заповніть бриф вручну, це швидко.
      </p>
    );
  }

  return (
    <dl className="flex flex-col gap-3">
      {rows.map(([label, value]) => (
        <div key={label} className="flex flex-col gap-0.5">
          <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
          <dd className="text-sm">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function OnboardingWizard() {
  const router = useRouter();
  const create = useCreateCompany();
  const start = useStartBootstrap();

  const [name, setName] = React.useState("");
  const [websiteUrl, setWebsiteUrl] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [companyId, setCompanyId] = React.useState<string | null>(null);

  const status = useBootstrapStatus(companyId);
  const state = status.data?.status;

  const canSubmit = name.trim().length > 0 && (websiteUrl.trim() || description.trim());

  function onCreate() {
    create.mutate(
      {
        name: name.trim(),
        websiteUrl: websiteUrl.trim() || undefined,
        description: description.trim() || undefined,
      },
      {
        onSuccess: ({ companyId: id }) => {
          setCompanyId(id);
          // Bootstrap запускаємо одразу: окрема кнопка «а тепер проаналізуйте сайт» була б зайвим
          // кроком — користувач уже дав джерело саме для цього.
          start.mutate(id, {
            onError: () =>
              toast.error("Компанію створено, але аналіз не запустився — заповніть бриф вручну"),
          });
        },
        onError: () => toast.error("Не вдалося створити компанію"),
      },
    );
  }

  // ── Крок 2: аналіз і його результат ──
  if (companyId) {
    const busy = state === "pending" || state === "running" || status.isLoading;

    return (
      <Card>
        <CardHeader>
          <CardTitle>
            {busy ? "Вивчаємо компанію…" : state === "failed" ? "Не вдалося проаналізувати" : "Готово"}
          </CardTitle>
          <CardDescription>
            {busy
              ? "Читаємо джерела й чернетимо бриф. Це займає близько хвилини."
              : "Це чернетка — перевірте й виправте її у брифі. Саме бриф стає джерелом правди для перевірки фактів."}
          </CardDescription>
        </CardHeader>

        <CardContent className="flex flex-col gap-5">
          {busy && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Аналізуємо…
            </p>
          )}

          {state === "failed" && (
            // Показуємо ПРИЧИНУ з бекенду, а не загальне «щось пішло не так»: людина має розуміти,
            // чи це проблема з її URL, чи з нашого боку.
            <p className="flex items-start gap-2 rounded-md border border-warning bg-background p-3 text-sm">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
              <span>{status.data?.error ?? "Аналіз не вдався. Заповніть бриф вручну."}</span>
            </p>
          )}

          {state === "done" && status.data?.profile && (
            <ProfilePreview profile={status.data.profile} />
          )}

          <div className="flex flex-wrap gap-2">
            <Button onClick={() => router.push(`/companies/${companyId}/brief`)} disabled={busy}>
              До брифу
              <ArrowRight />
            </Button>
            {/* Аналіз може зависнути або впасти — вихід має бути завжди, а не лише в успішній гілці. */}
            {busy && (
              <Button variant="ghost" onClick={() => router.push(`/companies/${companyId}/brief`)}>
                Пропустити й заповнити вручну
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  // ── Крок 1: мінімальні дані ──
  return (
    <Card>
      <CardHeader>
        <CardTitle>Розкажіть про компанію</CardTitle>
        <CardDescription>
          Потрібні лише назва та сайт (або опис одним рядком). Решту брифу ми зчернетимо самі.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <Label htmlFor="name">Назва компанії</Label>
          <Input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Forteq"
            autoFocus
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="site">Сайт</Label>
          <Input
            id="site"
            value={websiteUrl}
            onChange={(e) => setWebsiteUrl(e.target.value)}
            placeholder="forteq.dev"
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="desc">Або опишіть одним рядком</Label>
          <Textarea
            id="desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Робимо інтеграційні сервіси на TypeScript для середнього бізнесу"
            rows={2}
          />
          <p className="text-xs text-muted-foreground">
            Досить чогось одного — сайту або опису.
          </p>
        </div>

        <div className="flex justify-end">
          <Button onClick={onCreate} disabled={!canSubmit || create.isPending}>
            {create.isPending ? <Loader2 className="animate-spin" /> : <Sparkles />}
            Створити й проаналізувати
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
