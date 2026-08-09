"use client";

// §publishing: керування підключеннями соцмереж/Telegram. Картка на кожен провайдер
// (CONNECTION_PROVIDER_LABELS — єдине джерело лейблів). Соц-провайдери (linkedin/twitter/instagram)
// підключаються через OAuth: Connect → authorize → редірект на consent провайдера; Telegram —
// не OAuth, а форма (bot token + chat id). Контроли керування — лише під canManage (сервер усе одно
// форсить connection:manage; ховаємо недоступну дію, як в ApiKeysManager).
import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Link2, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  CONNECTION_PROVIDER_LABELS,
  PUBLISH_PROVIDERS,
  type ConnectionDTO,
  type ConnectionProvider,
  type ConnectionsResponse,
  type PublishProvider,
} from "@forteq/shared";
import {
  useConnections,
  useAuthorize,
  useConfigureTelegram,
  useDisconnect,
} from "@/features/connections/use-connections";
import { useT } from "@/lib/i18n";

function isPublishProvider(p: ConnectionProvider): p is PublishProvider {
  return (PUBLISH_PROVIDERS as readonly string[]).includes(p);
}

export function ConnectionsManager({
  initialConnections,
  canManage,
}: {
  initialConnections?: ConnectionsResponse;
  canManage: boolean;
}) {
  const t = useT();
  const { data } = useConnections(initialConnections);
  const items = data?.items ?? [];
  const configured = data?.configured ?? [];

  useCallbackToast();

  return (
    <div className="flex flex-col gap-4">
      {(Object.keys(CONNECTION_PROVIDER_LABELS) as ConnectionProvider[]).map((provider) => {
        const current = items.find((c) => c.provider === provider) ?? null;
        // Telegram не потребує серверних кред — завжди «configured». Соц-провайдер без серверних
        // ключів застосунку не може стартувати OAuth: показуємо його вимкненим із підказкою.
        const isConfigured = provider === "telegram" || configured.includes(provider);
        return provider === "telegram" ? (
          <TelegramCard key={provider} current={current} canManage={canManage} />
        ) : (
          <SocialCard
            key={provider}
            provider={provider as PublishProvider}
            current={current}
            configured={isConfigured}
            canManage={canManage}
          />
        );
      })}
    </div>
  );
}

// Читає ?connected=<provider> / ?error=<code> при поверненні з OAuth-callback, показує повідомлення
// й чистить query (щоб reload/шаринг не повторював тост). Callback редіректить сюди через BFF.
function useCallbackToast() {
  const t = useT();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const handled = React.useRef(false);

  React.useEffect(() => {
    if (handled.current) return;
    const connected = params.get("connected");
    const error = params.get("error");
    if (!connected && !error) return;
    handled.current = true;

    if (connected) {
      const label = CONNECTION_PROVIDER_LABELS[connected as ConnectionProvider] ?? connected;
      toast.success(`${label}: ${t("підключено")}`);
    } else if (error) {
      toast.error(`${t("Не вдалося підключити")}: ${error}`);
    }
    router.replace(pathname, { scroll: false });
    // Свідомо один раз на монтування: далі query вже почищено.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

function statusBadge(current: ConnectionDTO | null, t: (s: string) => string) {
  if (!current) {
    return (
      <Badge variant="outline" className="text-muted-foreground">
        {t("Не підключено")}
      </Badge>
    );
  }
  if (current.status === "connected") {
    return <Badge variant="secondary">{t("Підключено")}</Badge>;
  }
  if (current.status === "expired") {
    return <Badge variant="outline" className="text-warning">{t("Токен протух")}</Badge>;
  }
  return <Badge variant="outline" className="text-destructive">{t("Помилка підключення")}</Badge>;
}

function SocialCard({
  provider,
  current,
  configured,
  canManage,
}: {
  provider: PublishProvider;
  current: ConnectionDTO | null;
  configured: boolean;
  canManage: boolean;
}) {
  const t = useT();
  const label = CONNECTION_PROVIDER_LABELS[provider];
  const authorize = useAuthorize();
  const disconnect = useDisconnect();

  function onConnect() {
    authorize.mutate(provider, {
      onSuccess: ({ authUrl }) => {
        // Навігація браузера на consent провайдера (не fetch): звідти він повернеться на callback.
        window.location.assign(authUrl);
      },
      onError: (err) => {
        // 422 «провайдер не налаштований» тощо: сервер віддав людський message у ApiError.
        toast.error(err instanceof Error ? err.message : t("Не вдалося почати підключення"));
      },
    });
  }

  function onDisconnect() {
    disconnect.mutate(provider, {
      onSuccess: () => toast.success(`${label}: ${t("відключено")}`),
      onError: () => toast.error(t("Не вдалося відключити")),
    });
  }

  const connected = current?.status === "connected";

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Link2 className="h-4 w-4 text-muted-foreground" />
            {label}
          </CardTitle>
          {statusBadge(current, t)}
        </div>
        <CardDescription>
          {current?.externalAccountName
            ? `${t("Акаунт")}: ${current.externalAccountName}`
            : t("Опублікуйте схвалені пости прямо в цей акаунт.")}
        </CardDescription>
      </CardHeader>

      {canManage && (
        <CardContent className="flex flex-col gap-2">
          {!configured && (
            <p className="text-sm text-muted-foreground">{t("Потрібні ключі застосунку")}</p>
          )}
          {connected ? (
            <Button
              variant="ghost"
              size="sm"
              className="w-fit text-muted-foreground hover:text-destructive"
              onClick={onDisconnect}
              disabled={disconnect.isPending}
            >
              <Trash2 className="h-4 w-4" />
              {t("Відключити")}
            </Button>
          ) : (
            <Button
              className="w-fit"
              onClick={onConnect}
              disabled={!configured || authorize.isPending}
            >
              {authorize.isPending ? t("Підключаємо…") : t("Підключити")}
            </Button>
          )}
        </CardContent>
      )}
    </Card>
  );
}

function TelegramCard({
  current,
  canManage,
}: {
  current: ConnectionDTO | null;
  canManage: boolean;
}) {
  const t = useT();
  const [botToken, setBotToken] = React.useState("");
  const [chatId, setChatId] = React.useState("");
  const configure = useConfigureTelegram();

  function onSave() {
    const token = botToken.trim();
    const chat = chatId.trim();
    if (!token || !chat) {
      toast.error(t("Вкажіть токен бота й chat id"));
      return;
    }
    configure.mutate(
      { botToken: token, chatId: chat },
      {
        onSuccess: () => {
          toast.success(t("Telegram налаштовано"));
          setBotToken("");
          setChatId("");
        },
        onError: (err) =>
          toast.error(err instanceof Error ? err.message : t("Не вдалося налаштувати Telegram")),
      },
    );
  }

  const connected = current?.status === "connected";

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Send className="h-4 w-4 text-muted-foreground" />
            {CONNECTION_PROVIDER_LABELS.telegram}
          </CardTitle>
          {connected ? (
            <Badge variant="secondary">{t("Налаштовано")}</Badge>
          ) : (
            <Badge variant="outline" className="text-muted-foreground">
              {t("Не налаштовано")}
            </Badge>
          )}
        </div>
        <CardDescription>
          {t("Сповіщення в Telegram, коли контент прогону готовий до рецензії.")}
        </CardDescription>
      </CardHeader>

      {canManage && (
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-col gap-2">
            <Label htmlFor="tg-token">{connected ? t("Замінити токен бота") : t("Токен бота")}</Label>
            <Input
              id="tg-token"
              type="password"
              autoComplete="off"
              placeholder="123456:ABC-DEF…"
              value={botToken}
              onChange={(e) => setBotToken(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="tg-chat">{t("Chat ID")}</Label>
            <Input
              id="tg-chat"
              autoComplete="off"
              placeholder="-1001234567890"
              value={chatId}
              onChange={(e) => setChatId(e.target.value)}
            />
          </div>
          <Button
            className="w-fit"
            onClick={onSave}
            disabled={configure.isPending || !botToken.trim() || !chatId.trim()}
          >
            {configure.isPending ? t("Зберігаємо…") : t("Зберегти")}
          </Button>
        </CardContent>
      )}
    </Card>
  );
}
