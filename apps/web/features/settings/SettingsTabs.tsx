"use client";

// Клієнтський таб-перемикач для консолідованої сторінки /settings (§settings-hub). Окремого
// UI-примітиву Tabs у components/ui немає — робимо мінімальний доступний свій (tablist/tab/tabpanel),
// без нових залежностей і на дизайн-токенах.
//
// Джерело істини для активного табу — локальний state (ініціалізований з ?tab на сервері), а НЕ
// live-читання query. Це навмисно: ConnectionsManager.useCallbackToast після OAuth-повернення робить
// router.replace(pathname) і зчищає весь query (разом із ?tab). Якби таб виводився з URL, він би
// стрибав назад на «keys» одразу після тосту. Локальний state лишає користувача на «connections».
//
// Панелі рендеряться серверним компонентом і приходять як props (SSR-дані вже всередині кожного
// менеджера). Монтуємо лише активну панель — тоді при вході на ?tab=connections&connected=… панель
// підключень змонтується першою й тост спрацює; неактивні менеджери не смикають свої запити марно.
import * as React from "react";
import { usePathname, useRouter } from "next/navigation";

import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";

// Узагальнений таб-хаб: приймає масив уже підготовлених панелей (§per-company-settings — тепер його
// реюзає company-scoped сторінка налаштувань з табами «Ключі API» + «Підключення»). id — вільний
// рядок (напр. "keys"|"connections"); ярлики приходять уже перекладені від сервера.
export interface SettingsTabDef {
  id: string;
  label: string;
  panel: React.ReactNode;
}

export function SettingsTabs({
  initialTab,
  tabs,
}: {
  initialTab: string;
  tabs: SettingsTabDef[];
}) {
  const t = useT();
  const router = useRouter();
  const pathname = usePathname();
  const [active, setActive] = React.useState<string>(
    tabs.some((tb) => tb.id === initialTab) ? initialTab : (tabs[0]?.id ?? ""),
  );

  function selectTab(id: string) {
    setActive(id);
    // Робимо підрозділ лінкабельним/шарабельним; replace (не push), щоб не засмічувати історію.
    router.replace(`${pathname}?tab=${id}`, { scroll: false });
  }

  const activePanel = tabs.find((tab) => tab.id === active)?.panel ?? null;

  return (
    <div className="flex flex-col gap-6">
      <div
        role="tablist"
        aria-label={t("Розділи налаштувань")}
        className="flex gap-1 border-b border-border"
      >
        {tabs.map((tab) => {
          const isActive = tab.id === active;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              id={`settings-tab-${tab.id}`}
              aria-selected={isActive}
              aria-controls={`settings-panel-${tab.id}`}
              onClick={() => selectTab(tab.id)}
              className={cn(
                "-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      <div
        role="tabpanel"
        id={`settings-panel-${active}`}
        aria-labelledby={`settings-tab-${active}`}
      >
        {activePanel}
      </div>
    </div>
  );
}
