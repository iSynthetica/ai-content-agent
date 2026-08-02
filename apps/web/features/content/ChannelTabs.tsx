"use client";

// ChannelTabs (spike-3 §10.3, FR-9.2) — секції LinkedIn/Twitter/Instagram/Blog з лічильником
// постів і індикатором «є flagged». Активний таб — у ?channel= (шарабельний URL). Рендерить
// ContentItemCard для айтемів активного каналу. Без Radix Tabs (не встановлено) — на токенах.
import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CHANNELS, type Channel } from "@forteq/shared";

import { cn } from "@/lib/utils";
import { CHANNEL_META } from "@/components/common/channel-badge";
import { ContentItemCard } from "@/components/common/content-item-card";
import { useT } from "@/lib/i18n";
import type { ContentItemDTO } from "@/features/content/schemas";

function isChannel(v: string | null): v is Channel {
  return !!v && (CHANNELS as readonly string[]).includes(v);
}

export function ChannelTabs({
  items,
  runId,
  companyId,
}: {
  items: ContentItemDTO[];
  runId: string;
  companyId: string;
}) {
  const t = useT();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Групуємо айтеми за каналом (порядок каналів — фіксований CHANNELS).
  const byChannel = React.useMemo(() => {
    const map = new Map<Channel, ContentItemDTO[]>();
    for (const ch of CHANNELS) map.set(ch, []);
    for (const it of items) map.get(it.channel)?.push(it);
    return map;
  }, [items]);

  const urlChannel = searchParams.get("channel");
  const firstWithItems = CHANNELS.find((ch) => (byChannel.get(ch)?.length ?? 0) > 0);
  const active: Channel = isChannel(urlChannel) ? urlChannel : (firstWithItems ?? CHANNELS[0]);

  function selectChannel(ch: Channel) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("channel", ch);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  const activeItems = byChannel.get(active) ?? [];

  return (
    <div className="flex flex-col gap-4">
      <div
        role="tablist"
        aria-label={t("Канали")}
        className="flex flex-wrap gap-1 border-b border-border"
      >
        {CHANNELS.map((ch) => {
          const chItems = byChannel.get(ch) ?? [];
          const flagged = chItems.some((it) => (it.violations?.length ?? 0) > 0);
          const { label, Icon } = CHANNEL_META[ch];
          const isActive = ch === active;
          return (
            <button
              key={ch}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => selectChannel(ch)}
              className={cn(
                "-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="h-3.5 w-3.5" aria-hidden />
              {t(label)}
              <span className="tabular-nums text-xs text-muted-foreground">{chItems.length}</span>
              {flagged && (
                <span
                  aria-label={t("є порушення")}
                  className="h-1.5 w-1.5 rounded-full bg-warning"
                />
              )}
            </button>
          );
        })}
      </div>

      {activeItems.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          {t("Для цього каналу ще немає постів.")}
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          {activeItems.map((item) => (
            <ContentItemCard key={item.id} item={item} runId={runId} companyId={companyId} />
          ))}
        </div>
      )}
    </div>
  );
}
