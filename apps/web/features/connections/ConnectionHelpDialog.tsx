"use client";

// §publishing: попап «як налаштувати» для кожної картки підключення. Radix-Dialog у проєкті немає
// (CLI заборонено), тож — та сама мінімальна доступна модалка на токенах, що й VersionHistoryDialog:
// role="dialog" + aria-modal, Esc/бекдроп закривають, вміст скролиться при переповненні.
// Соц-провайдери показують точний Redirect URL для реєстрації у власному OAuth-застосунку; Telegram — ні
// (у нього немає реєстрації застосунку й редіректу).
import * as React from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { CONNECTION_PROVIDER_LABELS, type ConnectionProvider } from "@forteq/shared";
import { useT } from "@/lib/i18n";

type SocialProvider = Exclude<ConnectionProvider, "telegram">;

// Redirect URL, який орендар реєструє у СВОЄМУ OAuth-застосунку. Той самий формат, що й на картці
// (${origin}/api/connections/<provider>/callback), з копіюванням. Лише для соц-провайдерів.
function RedirectUrlBlock({ provider }: { provider: SocialProvider }) {
  const t = useT();
  // window недоступний під час SSR — origin читаємо в ефекті (уникаємо hydration-mismatch).
  const [origin, setOrigin] = React.useState("");
  const [copied, setCopied] = React.useState(false);
  React.useEffect(() => setOrigin(window.location.origin), []);
  const url = origin ? `${origin}/api/connections/${provider}/callback` : "";

  async function onCopy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success(t("Скопійовано"));
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard недоступний (http/permissions) — тихо ігноруємо, рядок усе одно видно */
    }
  }

  return (
    <div className="mt-3 rounded-md border border-border bg-muted/40 p-3">
      <Label className="text-xs font-medium text-foreground">
        {t("URL перенаправлення — зареєструйте його у застосунку")}
      </Label>
      <div className="mt-1.5 flex items-center gap-2">
        <code className="flex-1 overflow-x-auto rounded-md border border-border bg-background px-2 py-1.5 text-xs">
          {url || "…"}
        </code>
        <Button variant="outline" size="sm" className="shrink-0" onClick={onCopy} disabled={!url}>
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
}

// Виноска-нюанс під списком кроків (платний тариф X, App Review в Instagram тощо).
function Note({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-3 rounded-md border border-border bg-muted/40 p-2.5 text-xs text-muted-foreground">
      {children}
    </p>
  );
}

function Steps({ children }: { children: React.ReactNode }) {
  return (
    <ol className="list-decimal space-y-2 pl-5 text-sm text-muted-foreground marker:text-muted-foreground">
      {children}
    </ol>
  );
}

// Виділення назв кнопок/полів/продуктів у тексті кроку.
function B({ children }: { children: React.ReactNode }) {
  return <strong className="font-medium text-foreground">{children}</strong>;
}

function ProviderSteps({ provider }: { provider: ConnectionProvider }) {
  const t = useT();

  if (provider === "linkedin") {
    return (
      <>
        <Steps>
          <li>{t("Потрібна Company Page — LinkedIn вимагає прив'язати застосунок до сторінки компанії.")}</li>
          <li>
            {t("Створіть застосунок на")} <B>linkedin.com/developers/apps</B> → <B>Create app</B>{" "}
            {t("(назва, Page, лого, privacy URL).")}
          </li>
          <li>
            {t("Вкладка")} <B>Products</B> →{" "}
            {t("додайте «Sign In with LinkedIn using OpenID Connect» і «Share on LinkedIn».")}
          </li>
          <li>
            {t("Вкладка")} <B>Auth</B> →{" "}
            {t("додайте URL перенаправлення (нижче) до Authorized redirect URLs.")}
          </li>
          <li>{t("Там же скопіюйте Client ID і Client Secret.")}</li>
          <li>{t("Вставте їх у поля цієї картки → Зберегти ключі застосунку → Підключити.")}</li>
        </Steps>
        <RedirectUrlBlock provider="linkedin" />
        <Note>{t("MVP публікує від імені особи, яка авторизується, а не від Company Page.")}</Note>
      </>
    );
  }

  if (provider === "twitter") {
    return (
      <>
        <Steps>
          <li>
            <B>developer.x.com</B> →{" "}
            {t("створіть проєкт і застосунок, оберіть ПЛАТНИЙ тариф із write-доступом.")}
          </li>
          <li>
            {t("У налаштуваннях увімкніть")} <B>OAuth 2.0</B>, {t("тип —")} <B>Web App</B>{" "}
            {t("(confidential).")}
          </li>
          <li>{t("Додайте URL перенаправлення (нижче) як Callback URI.")}</li>
          <li>
            {t("Переконайтеся, що scope включає")}{" "}
            <B>tweet.write, users.read, offline.access, media.write</B>.
          </li>
          <li>{t("Скопіюйте Client ID і Client Secret (OAuth 2.0).")}</li>
          <li>{t("Вставте їх у поля картки → Зберегти ключі застосунку → Підключити.")}</li>
        </Steps>
        <RedirectUrlBlock provider="twitter" />
        <Note>
          {t(
            "Нюанс: write у X платний (~$0.015/пост) і за замовчуванням лімітований ~10 постів/24 год — ліміт піднімається вручну в порталі.",
          )}
        </Note>
      </>
    );
  }

  if (provider === "instagram") {
    return (
      <>
        <Steps>
          <li>{t("Переведіть IG-акаунт у Business/Creator і залінкуйте з Facebook-сторінкою.")}</li>
          <li>
            <B>developers.facebook.com</B> → {t("створіть Meta app (тип Business).")}
          </li>
          <li>
            {t("Додайте продукт")} <B>Facebook Login for Business</B>.
          </li>
          <li>{t("У Valid OAuth Redirect URIs додайте URL перенаправлення (нижче).")}</li>
          <li>
            {t("Запросіть дозволи")}{" "}
            <B>instagram_content_publish, instagram_basic, pages_show_list</B>{" "}
            {t("та ін. (потрібен App Review).")}
          </li>
          <li>{t("Скопіюйте App ID і App Secret → вставте у поля картки → Зберегти → Підключити.")}</li>
        </Steps>
        <RedirectUrlBlock provider="instagram" />
        <Note>
          {t(
            "Нюанс: App Review + верифікація бізнесу займають ~1–4 тижні; до схвалення працює лише в тестовому режимі.",
          )}
        </Note>
      </>
    );
  }

  // telegram
  return (
    <>
      <Steps>
        <li>
          {t("У Telegram напишіть")} <B>@BotFather</B> → <B>/newbot</B> →{" "}
          {t("отримаєте bot token.")}
        </li>
        <li>
          {t(
            "Дізнайтеся chat id: напишіть боту будь-що, відкрийте getUpdates і візьміть chat.id — або напишіть @userinfobot.",
          )}
        </li>
        <li>{t("Вставте bot token і chat id у поля картки → Зберегти.")}</li>
      </Steps>
      <Note>{t("Реєстрація застосунку й URL перенаправлення тут не потрібні.")}</Note>
    </>
  );
}

export function ConnectionHelpDialog({
  provider,
  open,
  onOpenChange,
}: {
  provider: ConnectionProvider;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useT();
  const label = CONNECTION_PROVIDER_LABELS[provider];
  const title = `${label}: ${t("як налаштувати")}`;

  // Esc закриває.
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" aria-hidden onClick={() => onOpenChange(false)} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative z-10 flex max-h-[85vh] w-full max-w-lg flex-col rounded-lg border border-border bg-card p-6 text-card-foreground shadow-lg"
      >
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>

        <div className="mt-4 flex-1 overflow-y-auto">
          <ProviderSteps provider={provider} />
        </div>

        <div className="mt-4 flex justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("Закрити")}
          </Button>
        </div>
      </div>
    </div>
  );
}
