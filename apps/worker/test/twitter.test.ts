import { afterEach, describe, expect, it, vi } from "vitest";
import {
  flattenMarkdownToText,
  makeTwitterPublisher,
  splitForTwitter,
  MAX,
} from "../src/lib/publishers/twitter";
import type { PublishInput } from "../src/lib/publishers/types";

// Офлайн-тест X/Twitter-публікатора (§publishing/02-twitter §3, §6): без мережі, fetch замоканий.
// Перевіряємо: flatten markdown→plain (URL збережено), розбивку 280+ на тред із reply-ланцюгом,
// одиничний твіт без розбивки, форму payload з media_ids, парсинг data.id + побудову URL,
// класифікацію помилок (429/5xx — retryable), порожній текст.

// ── Фейкова fetch-відповідь ────────────────────────────────────────────────────
interface FakeResponseInit {
  ok?: boolean;
  status?: number;
  json?: unknown;
  text?: string;
}

function fakeResponse(init: FakeResponseInit): Response {
  const status = init.status ?? (init.ok === false ? 500 : 200);
  return {
    ok: init.ok ?? (status >= 200 && status < 300),
    status,
    json: async () => init.json,
    text: async () => init.text ?? "",
  } as unknown as Response;
}

// Відповідь створеного твіта з даним id.
function tweetOk(id: string): Response {
  return fakeResponse({ status: 201, json: { data: { id } } });
}

function baseInput(overrides: Partial<PublishInput> = {}): PublishInput {
  return {
    item: {
      id: "item-1",
      channel: "twitter",
      title: null,
      text: "Hello world",
      imageUrl: null,
    },
    connection: { accessToken: "tok-123", externalAccountId: "1533" },
    ...overrides,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("flattenMarkdownToText", () => {
  it("strips markdown syntax but keeps URLs", () => {
    const md = [
      "# Heading",
      "",
      "**bold** and *italic* and _under_ and `code`",
      "",
      "> quoted",
      "- one",
      "1. two",
      "",
      "[label](https://example.com)",
    ].join("\n");
    const out = flattenMarkdownToText(md);
    expect(out).not.toContain("**");
    expect(out).not.toContain("# ");
    expect(out).toContain("Heading");
    expect(out).toContain("bold");
    expect(out).toContain("italic");
    expect(out).toContain("code");
    expect(out).toContain("quoted");
    expect(out).toContain("• one");
    expect(out).toContain("• two");
    expect(out).toContain("label");
    // URL збережено дослівно (X сам робить t.co) — і БЕЗ екранування (на відміну від LinkedIn little).
    expect(out).toContain("https://example.com");
    expect(out).not.toContain("\\");
  });

  it("handles empty / nullish input", () => {
    expect(flattenMarkdownToText("")).toBe("");
    // @ts-expect-error — навмисне перевіряємо null-стійкість
    expect(flattenMarkdownToText(null)).toBe("");
  });
});

describe("splitForTwitter", () => {
  it("returns a single part when text fits in 280", () => {
    expect(splitForTwitter("short text")).toEqual(["short text"]);
  });

  it("splits over-280 text into parts each <= 280 on word boundaries", () => {
    const text = Array.from({ length: 120 }, (_, i) => `word${i}`).join(" ");
    expect(text.length).toBeGreaterThan(MAX);
    const parts = splitForTwitter(text);
    expect(parts.length).toBeGreaterThan(1);
    for (const p of parts) expect(p.length).toBeLessThanOrEqual(MAX);
    // жодне слово не розірване: об'єднання назад = вихідний текст (по пробілу).
    expect(parts.join(" ")).toBe(text);
  });

  it("never splits a URL mid-string", () => {
    const url = "https://example.com/some/very/long/path?with=query&and=more";
    const filler = "x ".repeat(200);
    const parts = splitForTwitter(filler + url);
    // URL цілий у якійсь одній частині.
    expect(parts.some((p) => p.includes(url))).toBe(true);
  });

  it("hard-splits a single word longer than the limit", () => {
    const giant = "a".repeat(MAX * 2 + 5);
    const parts = splitForTwitter(giant);
    for (const p of parts) expect(p.length).toBeLessThanOrEqual(MAX);
    expect(parts.join("")).toBe(giant);
  });
});

describe("makeTwitterPublisher.publish", () => {
  it("posts a single tweet (no split) and parses data.id + builds the URL", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(tweetOk("1849"));
    vi.stubGlobal("fetch", fetchMock);

    const pub = makeTwitterPublisher();
    const res = await pub.publish(baseInput({ item: { id: "i", channel: "twitter", title: null, text: "just one tweet", imageUrl: null } }));

    expect(res.externalPostId).toBe("1849");
    expect(res.externalUrl).toBe("https://twitter.com/i/web/status/1849");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.twitter.com/2/tweets");
    expect(opts.method).toBe("POST");
    expect((opts.headers as Record<string, string>).Authorization).toBe("Bearer tok-123");
    const body = JSON.parse(opts.body as string);
    expect(body.text).toBe("just one tweet");
    expect(body.media).toBeUndefined();
    expect(body.reply).toBeUndefined();
  });

  it("splits long text into a reply-chain thread", async () => {
    const long = Array.from({ length: 120 }, (_, i) => `word${i}`).join(" ");
    const parts = splitForTwitter(long);
    expect(parts.length).toBeGreaterThan(1);

    const fetchMock = vi.fn();
    parts.forEach((_, i) => fetchMock.mockResolvedValueOnce(tweetOk(`id-${i}`)));
    vi.stubGlobal("fetch", fetchMock);

    const pub = makeTwitterPublisher();
    const res = await pub.publish(baseInput({ item: { id: "i", channel: "twitter", title: null, text: long, imageUrl: null } }));

    // повертається id/URL ПЕРШОГО твіта — канонічне посилання на тред.
    expect(res.externalPostId).toBe("id-0");
    expect(res.externalUrl).toBe("https://twitter.com/i/web/status/id-0");
    expect(fetchMock).toHaveBeenCalledTimes(parts.length);

    // твіт 0 — без reply; кожен наступний реплаїть на попередній.
    const body0 = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body0.reply).toBeUndefined();
    for (let i = 1; i < parts.length; i++) {
      const b = JSON.parse(fetchMock.mock.calls[i][1].body as string);
      expect(b.reply).toEqual({ in_reply_to_tweet_id: `id-${i - 1}` });
    }
  });

  it("uploads an image (INIT/APPEND/FINALIZE) and attaches media_ids to the first tweet", async () => {
    const fetchMock = vi
      .fn()
      // INIT
      .mockResolvedValueOnce(fakeResponse({ status: 200, json: { data: { id: "media-777" } } }))
      // APPEND
      .mockResolvedValueOnce(fakeResponse({ status: 204 }))
      // FINALIZE
      .mockResolvedValueOnce(fakeResponse({ status: 200, json: { data: { id: "media-777" } } }))
      // POST /2/tweets
      .mockResolvedValueOnce(tweetOk("tw-1"));
    vi.stubGlobal("fetch", fetchMock);

    const pub = makeTwitterPublisher();
    const res = await pub.publish(
      baseInput({
        item: { id: "i", channel: "twitter", title: null, text: "with image", imageUrl: "/api/media/x.png" },
        imageBytes: Buffer.from([1, 2, 3, 4]),
      }),
    );

    expect(res.externalPostId).toBe("tw-1");
    expect(fetchMock).toHaveBeenCalledTimes(4);

    // INIT — multipart FormData на /media/upload з command=INIT + розміром.
    const [initUrl, initOpts] = fetchMock.mock.calls[0];
    expect(initUrl).toBe("https://api.twitter.com/2/media/upload");
    const initForm = initOpts.body as FormData;
    expect(initForm.get("command")).toBe("INIT");
    expect(initForm.get("total_bytes")).toBe("4");
    expect(initForm.get("media_category")).toBe("tweet_image");

    // APPEND та FINALIZE — на під-URL із media id.
    expect(fetchMock.mock.calls[1][0]).toBe("https://api.twitter.com/2/media/upload/media-777/append");
    expect(fetchMock.mock.calls[2][0]).toBe("https://api.twitter.com/2/media/upload/media-777/finalize");

    // POST /2/tweets — media_ids містить рядковий media id.
    const tweetBody = JSON.parse(fetchMock.mock.calls[3][1].body as string);
    expect(tweetBody.media).toEqual({ media_ids: ["media-777"] });
  });

  it("throws a retryable error on 429 and 5xx, non-retryable on 400/401", async () => {
    for (const status of [429, 500, 503]) {
      const fetchMock = vi.fn().mockResolvedValueOnce(fakeResponse({ status, text: "boom" }));
      vi.stubGlobal("fetch", fetchMock);
      const pub = makeTwitterPublisher();
      await expect(pub.publish(baseInput())).rejects.toMatchObject({ retryable: true, status });
      vi.unstubAllGlobals();
    }

    for (const status of [400, 401]) {
      const fetchMock = vi.fn().mockResolvedValueOnce(fakeResponse({ status, text: "nope" }));
      vi.stubGlobal("fetch", fetchMock);
      const pub = makeTwitterPublisher();
      await expect(pub.publish(baseInput())).rejects.toMatchObject({ retryable: false, status });
      vi.unstubAllGlobals();
    }
  });

  it("fails when the text is empty", async () => {
    const pub = makeTwitterPublisher();
    await expect(
      pub.publish(baseInput({ item: { id: "i", channel: "twitter", title: null, text: null, imageUrl: null } })),
    ).rejects.toThrow(/порожній текст/);
  });

  it("throws when a 201 tweet response has no data.id", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(fakeResponse({ status: 201, json: { data: {} } }));
    vi.stubGlobal("fetch", fetchMock);
    const pub = makeTwitterPublisher();
    await expect(pub.publish(baseInput())).rejects.toThrow(/data\.id/);
  });
});
