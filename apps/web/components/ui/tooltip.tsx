"use client";

// Легкий tooltip без Radix (пакет @radix-ui/react-tooltip у проєкті не встановлений, а CLI —
// заборонено). Показ на hover і focus (a11y, DS §8). Позиція — над тригером; стилі — лише токени.
import * as React from "react";

import { cn } from "@/lib/utils";

export function Tooltip({
  content,
  children,
  className,
}: {
  content: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);
  if (content == null || content === "") return <>{children}</>;
  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      {children}
      {open && (
        <span
          role="tooltip"
          className={cn(
            "pointer-events-none absolute bottom-full left-1/2 z-50 mb-1.5 w-max max-w-xs -translate-x-1/2",
            "rounded-md border border-border bg-popover px-2.5 py-1.5 text-xs font-normal leading-snug text-popover-foreground shadow-md",
            className,
          )}
        >
          {content}
        </span>
      )}
    </span>
  );
}
