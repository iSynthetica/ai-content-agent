"use client";

// Перемикач МОВИ ІНТЕРФЕЙСУ (не мова генерації контенту — та живе у формі нижче як окреме поле
// "language"/GENERATION_LANGUAGES). Живе на екрані налаштувань компанії поруч із рештою брифу,
// бо це єдине спільне "налаштування" поза формою компанії/API-ключів. Вибір одразу пише cookie
// (@/lib/i18n LanguageProvider.setLanguage) і перезавантажує сторінку — весь застосунок, включно
// із серверними компонентами, перерендерюється новою мовою.
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { LANGUAGES, useLanguage, type Language } from "@/lib/i18n";

export function LanguageSwitcher() {
  const { language, setLanguage, t } = useLanguage();

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("Мова інтерфейсу")}</CardTitle>
        <CardDescription>
          {t("Мова меню, кнопок і повідомлень застосунку. Не впливає на мову згенерованого контенту.")}
        </CardDescription>
      </CardHeader>
      <CardContent className="sm:max-w-xs">
        <Select value={language} onChange={(e) => setLanguage(e.target.value as Language)}>
          {LANGUAGES.map((l) => (
            <option key={l.code} value={l.code}>
              {l.label}
            </option>
          ))}
        </Select>
      </CardContent>
    </Card>
  );
}
