// ChannelBadge (DS §6.2) — канал + lucide-іконка, нейтральний бейдж БЕЗ «фірмових» кольорів
// мереж (стриманість, DS §3). CHANNEL_META експортуємо, щоб таби перевикористали лейбли/іконки.
import { FileText, Instagram, Linkedin, Twitter, type LucideIcon } from "lucide-react";
import type { Channel } from "@forteq/shared";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export const CHANNEL_META: Record<Channel, { label: string; Icon: LucideIcon }> = {
  linkedin: { label: "LinkedIn", Icon: Linkedin },
  twitter: { label: "Twitter", Icon: Twitter },
  instagram: { label: "Instagram", Icon: Instagram },
  blog: { label: "Блог", Icon: FileText },
};

export function ChannelBadge({ channel, className }: { channel: Channel; className?: string }) {
  const { label, Icon } = CHANNEL_META[channel];
  return (
    <Badge variant="outline" className={cn("gap-1", className)}>
      <Icon className="h-3 w-3" aria-hidden />
      {label}
    </Badge>
  );
}
