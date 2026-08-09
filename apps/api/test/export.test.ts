// Unit — серіалізація вивантаження (FR-10.1/10.2). Формат файлу ламається непомітно: зайвий
// заголовок або загублений пост не видно ні в типах, ні в 200 OK — тільки у скачаному файлі.
import { describe, expect, it } from "vitest";
import { serializeRun, toJson, toMarkdown } from "../src/lib/export";
import type { ContentItem, RunSummary } from "../src/repositories/interfaces";

const run: RunSummary = {
  id: "11111111-2222-3333-4444-555555555555",
  companyId: "c1",
  status: "needs_review",
  scheduledFor: null,
  costCents: 7,
  createdAt: "2026-07-19T10:30:00.000Z",
};

function item(over: Partial<ContentItem> = {}): ContentItem {
  return {
    id: "i1",
    runId: run.id,
    channel: "linkedin",
    topic: "Мікросервіси",
    text: "Текст поста.",
    scores: { toneAlignment: { score: 4, why: "тон збігається з брифом" } },
    violations: null,
    imageUrl: null,
    status: "approved",
    version: 1,
    archivedAt: null,
    ...over,
  };
}

describe("toMarkdown", () => {
  it("містить текст КОЖНОГО поста", () => {
    const md = toMarkdown(run, [
      item({ id: "a", text: "Перший пост" }),
      item({ id: "b", channel: "twitter", text: "Другий пост" }),
      item({ id: "c", channel: "blog", text: "Третій пост" }),
    ]);
    expect(md).toContain("Перший пост");
    expect(md).toContain("Другий пост");
    expect(md).toContain("Третій пост");
  });

  it("групує за каналами у СТАЛОМУ порядку незалежно від порядку на вході", () => {
    // Два вивантаження того самого прогону мають давати ідентичний файл — інакше його не порівняти діффом.
    const a = toMarkdown(run, [item({ id: "1", channel: "twitter" }), item({ id: "2", channel: "blog" })]);
    const b = toMarkdown(run, [item({ id: "2", channel: "blog" }), item({ id: "1", channel: "twitter" })]);
    expect(a).toBe(b);
    expect(a.indexOf("## Блог")).toBeLessThan(a.indexOf("## X (Twitter)"));
  });

  it("виносить оцінки з поясненням і порушення з цитатою", () => {
    const md = toMarkdown(run, [
      item({ violations: [{ quote: "40% зростання", issue: "немає джерела" }] }),
    ]);
    expect(md).toContain("toneAlignment: 4/5 — тон збігається з брифом");
    expect(md).toContain("немає джерела — «40% зростання»");
  });

  it("порушення без цитати (історичні рядки) не ламають формат", () => {
    const md = toMarkdown(run, [item({ violations: [{ quote: "", issue: "загальна претензія" }] })]);
    expect(md).toContain("- загальна претензія");
    expect(md).not.toContain("«»");
  });

  it("порожній прогін дає валідний файл, а не поламаний", () => {
    const md = toMarkdown(run, []);
    expect(md).toContain("немає згенерованих постів");
  });

  it("відсутній текст не виводиться як undefined", () => {
    const md = toMarkdown(run, [item({ text: null })]);
    expect(md).not.toContain("undefined");
    expect(md).toContain("Текст відсутній");
  });

  it("картинка instagram потрапляє у файл як markdown-зображення", () => {
    const md = toMarkdown(run, [item({ channel: "instagram", imageUrl: "file:///img.png" })]);
    expect(md).toContain("![Зображення](file:///img.png)");
  });
});

describe("toJson", () => {
  it("віддає валідний JSON з усіма постами", () => {
    const parsed = JSON.parse(toJson(run, [item({ id: "a" }), item({ id: "b", channel: "blog" })]));
    expect(parsed.items).toHaveLength(2);
    expect(parsed.run.id).toBe(run.id);
    expect(parsed.run.costCents).toBe(7);
  });

  it("зберігає порушення структурованими, не рядком", () => {
    const parsed = JSON.parse(
      toJson(run, [item({ violations: [{ quote: "40%", issue: "немає джерела" }] })]),
    );
    expect(parsed.items[0].violations[0]).toEqual({ quote: "40%", issue: "немає джерела" });
  });
});

describe("serializeRun", () => {
  it("md: правильні розширення, content-type і дата у назві", () => {
    const f = serializeRun(run, [item()], "md");
    expect(f.filename).toBe("forteq-2026-07-19-11111111.md");
    expect(f.contentType).toContain("text/markdown");
  });

  it("json: правильні розширення і content-type", () => {
    const f = serializeRun(run, [item()], "json");
    expect(f.filename).toBe("forteq-2026-07-19-11111111.json");
    expect(f.contentType).toContain("application/json");
  });
});
