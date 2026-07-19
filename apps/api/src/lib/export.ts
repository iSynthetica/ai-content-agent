// Серіалізація прогону в файл для вивантаження (FR-10.1 MUST — Markdown, FR-10.2 SHOULD — JSON).
//
// Свідомо ЧИСТІ функції без БД, Express і файлової системи: формат вивантаження — це те, що
// найлегше зламати непомітно (зайвий заголовок, загублений пост, зіпсоване екранування), і
// перевіряти його треба юніт-тестом, а не ручним завантаженням файлу.
import type { ContentItem, RunSummary } from "../repositories/interfaces";

export type ExportFormat = "md" | "json";

export interface ExportedFile {
  filename: string;
  contentType: string;
  body: string;
}

const CHANNEL_TITLES: Record<string, string> = {
  linkedin: "LinkedIn",
  twitter: "X (Twitter)",
  instagram: "Instagram",
  blog: "Блог",
};

// Порядок каналів у файлі фіксований, а не «як прийшло з БД»: вивантаження того самого прогону
// двічі має давати ідентичний файл (інакше його не порівняти діффом).
const CHANNEL_ORDER = ["blog", "linkedin", "twitter", "instagram"] as const;

function channelRank(channel: string): number {
  const i = CHANNEL_ORDER.indexOf(channel as (typeof CHANNEL_ORDER)[number]);
  return i === -1 ? CHANNEL_ORDER.length : i;
}

function sortItems(items: readonly ContentItem[]): ContentItem[] {
  return [...items].sort((a, b) => channelRank(a.channel) - channelRank(b.channel) || a.id.localeCompare(b.id));
}

const STATUS_LABELS: Record<string, string> = {
  draft: "чернетка",
  needs_revision: "потребує доопрацювання",
  approved: "схвалено",
  rejected: "відхилено",
};

function fmtDate(iso: string): string {
  return iso.slice(0, 10);
}

/**
 * Markdown-вивантаження: людиночитний пакет контенту, який можна одразу віддати копірайтеру
 * або вставити в публікатор.
 *
 * Оцінки й порушення включаємо СВІДОМО: файл лишається єдиним артефактом рецензії, інакше
 * контекст «чому цей пост позначено» губиться в момент вивантаження.
 */
export function toMarkdown(run: RunSummary, items: readonly ContentItem[]): string {
  const sorted = sortItems(items);
  const lines: string[] = [];

  lines.push(`# Контент-пакет за ${fmtDate(run.createdAt)}`);
  lines.push("");
  lines.push(`- Прогін: \`${run.id}\``);
  lines.push(`- Постів: ${sorted.length}`);
  lines.push(`- Вартість: $${(run.costCents / 100).toFixed(2)}`);
  lines.push("");

  if (sorted.length === 0) {
    lines.push("_У цьому прогоні немає згенерованих постів._");
    lines.push("");
    return lines.join("\n");
  }

  let currentChannel = "";
  for (const item of sorted) {
    if (item.channel !== currentChannel) {
      currentChannel = item.channel;
      lines.push(`## ${CHANNEL_TITLES[item.channel] ?? item.channel}`);
      lines.push("");
    }

    if (item.topic) {
      lines.push(`### ${item.topic}`);
      lines.push("");
    }

    lines.push(`**Статус:** ${STATUS_LABELS[item.status] ?? item.status}`);
    lines.push("");
    lines.push(item.text ?? "_Текст відсутній._");
    lines.push("");

    if (item.imageUrl) {
      lines.push(`![Зображення](${item.imageUrl})`);
      lines.push("");
    }

    if (item.scores && Object.keys(item.scores).length > 0) {
      lines.push("**Оцінки:**");
      lines.push("");
      for (const [criterion, s] of Object.entries(item.scores)) {
        lines.push(`- ${criterion}: ${s.score}/5 — ${s.why}`);
      }
      lines.push("");
    }

    if (item.violations && item.violations.length > 0) {
      lines.push("**Порушення:**");
      lines.push("");
      for (const v of item.violations) {
        lines.push(v.quote ? `- ${v.issue} — «${v.quote}»` : `- ${v.issue}`);
      }
      lines.push("");
    }

    lines.push("---");
    lines.push("");
  }

  return lines.join("\n");
}

/** JSON-вивантаження: машиночитне, для інтеграцій і бекапів. */
export function toJson(run: RunSummary, items: readonly ContentItem[]): string {
  return JSON.stringify(
    {
      run: {
        id: run.id,
        companyId: run.companyId,
        status: run.status,
        costCents: run.costCents,
        createdAt: run.createdAt,
      },
      items: sortItems(items).map((i) => ({
        id: i.id,
        channel: i.channel,
        topic: i.topic,
        text: i.text,
        status: i.status,
        imageUrl: i.imageUrl,
        scores: i.scores,
        violations: i.violations,
      })),
    },
    null,
    2,
  );
}

export function serializeRun(
  run: RunSummary,
  items: readonly ContentItem[],
  format: ExportFormat,
): ExportedFile {
  // Ім'я файлу — дата + короткий id прогону: у теці завантажень має бути видно, що це і коли,
  // без відкриття. Повний uuid зробив би назву нечитабельною.
  const stem = `forteq-${fmtDate(run.createdAt)}-${run.id.slice(0, 8)}`;
  return format === "json"
    ? { filename: `${stem}.json`, contentType: "application/json; charset=utf-8", body: toJson(run, items) }
    : { filename: `${stem}.md`, contentType: "text/markdown; charset=utf-8", body: toMarkdown(run, items) };
}
