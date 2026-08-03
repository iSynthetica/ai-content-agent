"use client";

// BYOK: керування ключами провайдерів акаунта (§ADR-0016). Показує статус кожного провайдера
// (налаштовано/ні + last4); owner/admin можуть додати/ротувати/видалити. Ключ уводиться, але
// НІКОЛИ не читається назад — сервер віддає лише маскований last4.
import { useState } from "react";
import { KeyRound, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ApiKeyDTO, ApiKeyProvider } from "@/lib/dto";
import { useApiKeys, useDeleteApiKey, useSetApiKey } from "@/features/api-keys/use-api-keys";
import { useT } from "@/lib/i18n";

const PROVIDERS: Array<{ id: ApiKeyProvider; label: string; hint: string }> = [
  { id: "openai", label: "OpenAI", hint: "Потрібен для генерації тексту й зображень (gpt-image-1)." },
  { id: "anthropic", label: "Anthropic", hint: "Потрібен, лише якщо в налаштуваннях обрано Claude." },
  { id: "gemini", label: "Google Gemini", hint: "Потрібен, лише якщо в налаштуваннях обрано Gemini." },
  { id: "tavily", label: "Tavily (веб-пошук)", hint: "Необов'язковий: свій ключ для research-пошуку. Без нього використовується платформенний." },
];

export function ApiKeysManager({
  initialKeys,
  canManage,
}: {
  initialKeys?: ApiKeyDTO[];
  canManage: boolean;
}) {
  const { data: keys = [] } = useApiKeys(initialKeys);
  return (
    <div className="flex flex-col gap-4">
      {PROVIDERS.map((p) => (
        <ProviderCard
          key={p.id}
          provider={p.id}
          label={p.label}
          hint={p.hint}
          current={keys.find((k) => k.provider === p.id) ?? null}
          canManage={canManage}
        />
      ))}
    </div>
  );
}

function ProviderCard({
  provider,
  label,
  hint,
  current,
  canManage,
}: {
  provider: ApiKeyProvider;
  label: string;
  hint: string;
  current: ApiKeyDTO | null;
  canManage: boolean;
}) {
  const t = useT();
  const [value, setValue] = useState("");
  const setKey = useSetApiKey();
  const delKey = useDeleteApiKey();

  function onSave() {
    const key = value.trim();
    if (key.length < 16) {
      toast.error(t("Ключ виглядає надто коротким"));
      return;
    }
    setKey.mutate(
      { provider, key },
      {
        onSuccess: () => {
          toast.success(`${label}: ${t("ключ збережено")}`);
          setValue("");
        },
      },
    );
  }

  function onDelete() {
    delKey.mutate(provider, {
      onSuccess: () => toast.success(`${label}: ${t("ключ видалено")}`),
    });
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <KeyRound className="h-4 w-4 text-muted-foreground" />
            {label}
          </CardTitle>
          {current ? (
            <Badge variant="secondary">{t("Налаштовано")} ····{current.last4}</Badge>
          ) : (
            <Badge variant="outline" className="text-muted-foreground">
              {t("Не налаштовано")}
            </Badge>
          )}
        </div>
        <CardDescription>{t(hint)}</CardDescription>
      </CardHeader>

      {canManage && (
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-col gap-2">
            <Label htmlFor={`key-${provider}`}>
              {current ? t("Замінити ключ") : t("Додати ключ")}
            </Label>
            <div className="flex gap-2">
              <Input
                id={`key-${provider}`}
                type="password"
                autoComplete="off"
                placeholder={provider === "openai" ? "sk-…" : "sk-ant-…"}
                value={value}
                onChange={(e) => setValue(e.target.value)}
              />
              <Button onClick={onSave} disabled={setKey.isPending || value.trim().length === 0}>
                {setKey.isPending ? t("Зберігаємо…") : t("Зберегти")}
              </Button>
            </div>
          </div>
          {current && (
            <Button
              variant="ghost"
              size="sm"
              className="w-fit text-muted-foreground hover:text-destructive"
              onClick={onDelete}
              disabled={delKey.isPending}
            >
              <Trash2 className="h-4 w-4" />
              {t("Видалити ключ")}
            </Button>
          )}
        </CardContent>
      )}
    </Card>
  );
}
