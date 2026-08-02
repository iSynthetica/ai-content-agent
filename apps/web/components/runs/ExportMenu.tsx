"use client";

// Вивантаження пакета прогону (FR-10.1 MUST — Markdown, FR-10.2 SHOULD — JSON).
//
// Свідомо звичайне <a download>, а не fetch+Blob: api віддає файл із Content-Disposition, BFF-проксі
// пробрасує цей заголовок (RESPONSE_WHITELIST), тож браузер сам зробить правильне завантаження з
// правильною назвою. Ручне збирання Blob'а лише продублювало б цю логіку і загубило б ім'я файлу.
import { Download } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { endpoints } from "@/lib/endpoints";
import { useT } from "@/lib/i18n";

export function ExportMenu({ runId, disabled }: { runId: string; disabled?: boolean }) {
  const t = useT();
  const href = (format: "md" | "json") => `${endpoints.export(runId)}?format=${format}`;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" disabled={disabled}>
          <Download />
          {t("Експорт")}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem asChild>
          <a href={href("md")} download>
            Markdown (.md)
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <a href={href("json")} download>
            JSON (.json)
          </a>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
