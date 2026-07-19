"use client";

// PostBody — тіло згенерованого поста для рецензії.
//
// Рендер КАНАЛО-ЗАЛЕЖНИЙ, і це не косметика, а вимога коректності:
//   • blog — Writer віддає справжній markdown (## заголовки, списки, **жирний**), тож сирий текст
//     показував би читачеві літеральні "##".
//   • соцмережі — це PLAIN TEXT з хештегами й емодзі. Прогнати їх через markdown НЕ МОЖНА:
//     рядок "#DevOps #TypeScript" на початку абзацу став би заголовком H1, а "1/4" — списком.
//     Тому для них лишається whitespace-pre-wrap, який зберігає авторські переноси як є.
//
// Довгий текст (блог ~4500 символів) згортаємо: інакше оцінки Reviewer'а й кнопки рішення
// їдуть так далеко вниз, що сторінка рецензії стає непридатною для швидкого перегляду.
import * as React from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ContentItemDTO } from "@/features/content/schemas";

// Понад цю довжину текст згортаємо. ~900 символів ≈ повний LinkedIn-пост, тобто соцмережі
// здебільшого лишаються розгорнутими, а згортається саме довгий блог.
const COLLAPSE_OVER = 900;

// Явні класи для markdown-елементів: @tailwindcss/typography у проєкті немає, і тягнути його
// заради одного каналу надлишково.
//
// `node` треба ВІДРІЗАТИ від spread'у: react-markdown передає його кожному компоненту як службовий
// AST-вузол, і без цього React виводить його в DOM атрибутом node="[object Object]".
type MdProps<T extends keyof React.JSX.IntrinsicElements> = React.ComponentProps<T> & {
  node?: unknown;
};

const MD_COMPONENTS = {
  h1: ({ node, ...p }: MdProps<"h1">) => <h1 className="mt-4 text-lg font-semibold" {...p} />,
  h2: ({ node, ...p }: MdProps<"h2">) => <h2 className="mt-4 text-base font-semibold" {...p} />,
  h3: ({ node, ...p }: MdProps<"h3">) => <h3 className="mt-3 text-sm font-semibold" {...p} />,
  p: ({ node, ...p }: MdProps<"p">) => <p className="leading-relaxed" {...p} />,
  ul: ({ node, ...p }: MdProps<"ul">) => <ul className="list-disc space-y-1 pl-5" {...p} />,
  ol: ({ node, ...p }: MdProps<"ol">) => <ol className="list-decimal space-y-1 pl-5" {...p} />,
  strong: ({ node, ...p }: MdProps<"strong">) => <strong className="font-semibold" {...p} />,
  code: ({ node, ...p }: MdProps<"code">) => (
    <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs" {...p} />
  ),
  blockquote: ({ node, ...p }: MdProps<"blockquote">) => (
    <blockquote className="border-l-2 border-border pl-3 italic text-muted-foreground" {...p} />
  ),
  a: ({ node, ...p }: MdProps<"a">) => (
    <a className="underline underline-offset-2" target="_blank" rel="noreferrer" {...p} />
  ),
  table: ({ node, ...p }: MdProps<"table">) => (
    // Широка таблиця не має розпирати картку — скрол лишається всередині свого контейнера.
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-xs" {...p} />
    </div>
  ),
  th: ({ node, ...p }: MdProps<"th">) => (
    <th className="border border-border px-2 py-1 text-left font-medium" {...p} />
  ),
  td: ({ node, ...p }: MdProps<"td">) => <td className="border border-border px-2 py-1" {...p} />,
};

export function PostBody({ text, channel }: { text: string; channel: ContentItemDTO["channel"] }) {
  const collapsible = text.length > COLLAPSE_OVER;
  const [expanded, setExpanded] = React.useState(false);
  const collapsed = collapsible && !expanded;

  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <div
          className={cn(
            "text-sm",
            // Згорнутий стан — обмеження висоти + градієнт-згасання, щоб було видно, що текст триває.
            collapsed && "max-h-64 overflow-hidden",
          )}
        >
          {channel === "blog" ? (
            // react-markdown НЕ рендерить сирий HTML (rehype-raw не підключений) — модель не може
            // впровадити розмітку у сторінку через згенерований текст.
            <div className="flex flex-col gap-2">
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={MD_COMPONENTS}>
                {text}
              </ReactMarkdown>
            </div>
          ) : (
            <p className="whitespace-pre-wrap leading-relaxed">{text}</p>
          )}
        </div>

        {collapsed && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-card to-transparent" />
        )}
      </div>

      {collapsible && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="self-start"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? <ChevronUp /> : <ChevronDown />}
          {expanded ? "Згорнути" : `Читати повністю (${text.length} символів)`}
        </Button>
      )}
    </div>
  );
}
