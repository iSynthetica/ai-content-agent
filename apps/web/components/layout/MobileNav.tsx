"use client";

// Мобільна навігація (< md): гамбургер у Topbar відкриває slide-over drawer з тим самим NavList.
// Раніше під 767px бокове меню просто ховалось (Sidebar: hidden md:flex) і викликати його не було
// як — навігація ставала недоступною. Escape і клік по бекдропу закривають; клік по лінку теж
// (onNavigate), інакше drawer лишався б відкритим поверх нової сторінки.
import { useEffect, useState } from "react";
import { Menu, Sparkles, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { NavList } from "@/components/layout/NavList";
import type { Company } from "@/features/companies/use-companies";

export function MobileNav({ companies }: { companies: Company[] }) {
  const [open, setOpen] = useState(false);

  // Escape закриває; body-scroll лочимо, поки drawer відкритий (інакше фон скролиться під ним).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="md:hidden"
        aria-label="Відкрити меню"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <Menu />
      </Button>

      {open && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="absolute inset-0 bg-foreground/40"
            aria-hidden
            onClick={() => setOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 flex w-64 max-w-[80%] flex-col border-r border-border bg-background shadow-lg">
            <div className="flex h-14 items-center justify-between px-5">
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                <span className="text-sm font-semibold tracking-tight">Forteq</span>
              </div>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Закрити меню"
                onClick={() => setOpen(false)}
              >
                <X />
              </Button>
            </div>
            <NavList companies={companies} onNavigate={() => setOpen(false)} />
          </aside>
        </div>
      )}
    </>
  );
}
