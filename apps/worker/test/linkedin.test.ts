import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clampCommentary,
  flattenMarkdownToLittle,
  makeLinkedInPublisher,
} from "../src/lib/publishers/linkedin";
import type { PublishInput } from "../src/lib/publishers/types";

// Офлайн-тест LinkedIn-публікатора (§publishing/01-linkedin §5): без мережі, fetch замоканий.
// Перевіряємо: flatten+escape little-формату, усічення 3000, форму payload (text-only vs image),
// парсинг x-restli-id, класифікацію помилок (429/409/5xx — retryable).

const VERSION = "202606";

// ── Фейкова fetch-відповідь ────────────────────────────────────────────────────
interface FakeResponseInit {
  ok?: boolean;
  status?: number;
  headers?: Record<string, string>;
  json?: unknown;
  text?: string;
}

function fakeResponse(init: FakeResponseInit): Response {
  const status = init.status ?? (init.ok === false ? 500 : 200);
  const headerMap = new Map(
    Object.entries(init.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v]),
  );
  return {
    ok: init.ok ?? (status >= 200 && status < 300),
    status,
    headers: { get: (k: string) => headerMap.get(k.toLowerCase()) ?? null },
    json: async () => init.json,
    text: async () => init.text ?? "",
  } as unknown as Response;
}

function baseInput(overrides: Partial<PublishInput> = {}): PublishInput {
  return {
    item: {
      id: "item-1",
      channel: "linkedin",
      title: null,
      text: "Hello world",
      imageUrl: null,
    },
    connection: { accessToken: "tok-123", externalAccountId: "urn:li:person:ABC" },
    ...overrides,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("flattenMarkdownToLittle", () => {
  it("strips markdown syntax (headings, bold, italic, code, quotes, lists, links)", () => {
    const md = [
      "# Heading",
      "",
      "**bold** and *italic* and _under_ and `code`",
      "",
      "> quoted",
      "- one",
      "- two",
      "1. three",
      "",
      "[label](https://example.com)",
    ].join("\n");
    const out = flattenMarkdownToLittle(md);
    expect(out).not.toContain("**");
    expect(out).toContain("Heading");
    expect(out).toContain("bold");
    expect(out).toContain("italic");
    expect(out).toContain("under");
    expect(out).toContain("code");
    expect(out).toContain("quoted");
    expect(out).toContain("• one");
    expect(out).toContain("• two");
    expect(out).toContain("• three");
    expect(out).toContain("label");
    // URL містить '(' символ у little? ні — bare URL, але little escape додасть \ до жодних дужок тут.
    expect(out).toContain("https");
  });

  it("escapes every reserved little character with a backslash", () => {
    // Всі зарезервовані символи, подані як literal-текст (не markdown-синтаксис).
    const raw = "a\\b|c{d}e@f[g]h(i)j<k>l#m~n";
    const out = flattenMarkdownToLittle(raw);
    // backslash екранований першим → подвоєний.
    expect(out).toContain("\\\\");
    for (const ch of ["|", "{", "}", "@", "[", "]", "(", ")", "<", ">", "#", "~"]) {
      expect(out).toContain("\\" + ch);
    }
  });

  it("does not leave a bare '#' that would become a hashtag", () => {
    const out = flattenMarkdownToLittle("# Title\n\nbody");
    expect(out.startsWith("Title")).toBe(true);
    expect(out).not.toContain("# ");
  });

  it("handles empty / nullish input", () => {
    expect(flattenMarkdownToLittle("")).toBe("");
    // @ts-expect-error — навмисне перевіряємо null-стійкість
    expect(flattenMarkdownToLittle(null)).toBe("");
  });
});

describe("clampCommentary", () => {
  it("leaves short text untouched", () => {
    expect(clampCommentary("short")).toBe("short");
  });

  it("truncates over-3000 text at a word boundary with an ellipsis", () => {
    const long = "word ".repeat(1000); // ~5000 chars
    const out = clampCommentary(long);
    expect(out.length).toBeLessThanOrEqual(3000);
    expect(out.endsWith("…")).toBe(true);
    // усічено по межі слова → нема обірваного "wor"
    expect(out).not.toMatch(/wor…$/);
  });
});

describe("makeLinkedInPublisher.publish", () => {
  it("posts text-only payload and parses x-restli-id from the header", async () => {
    const urn = "urn:li:share:6844785523593134080";
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(fakeResponse({ status: 201, headers: { "x-restli-id": urn } }));
    vi.stubGlobal("fetch", fetchMock);

    const pub = makeLinkedInPublisher(VERSION);
    const res = await pub.publish(baseInput({ item: { id: "i", channel: "linkedin", title: "T", text: "B", imageUrl: null } }));

    expect(res.externalPostId).toBe(urn);
    expect(res.externalUrl).toBe(`https://www.linkedin.com/feed/update/${urn}/`);

    // один виклик — лише /rest/posts (без Images API).
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.linkedin.com/rest/posts");
    const headers = opts.headers as Record<string, string>;
    expect(headers["LinkedIn-Version"]).toBe(VERSION);
    expect(headers["X-Restli-Protocol-Version"]).toBe("2.0.0");
    expect(headers.Authorization).toBe("Bearer tok-123");

    const body = JSON.parse(opts.body as string);
    expect(body.author).toBe("urn:li:person:ABC");
    expect(body.visibility).toBe("PUBLIC");
    expect(body.lifecycleState).toBe("PUBLISHED");
    // title стає першим рядком commentary.
    expect(body.commentary).toContain("T");
    expect(body.commentary).toContain("B");
    // text-only → без content.media.
    expect(body.content).toBeUndefined();
  });

  it("runs the 3-step image flow and attaches the image URN", async () => {
    const imageUrn = "urn:li:image:C4E10AQFoyyAjHPMQuQ";
    const postUrn = "urn:li:share:999";
    const fetchMock = vi
      .fn()
      // Step A: initializeUpload
      .mockResolvedValueOnce(
        fakeResponse({
          status: 200,
          json: { value: { uploadUrl: "https://dms.example/upload/0", image: imageUrn } },
        }),
      )
      // Step B: PUT bytes to DMS host
      .mockResolvedValueOnce(fakeResponse({ status: 201 }))
      // Step C: create post
      .mockResolvedValueOnce(fakeResponse({ status: 201, headers: { "x-restli-id": postUrn } }));
    vi.stubGlobal("fetch", fetchMock);

    const pub = makeLinkedInPublisher(VERSION);
    const res = await pub.publish(
      baseInput({
        item: { id: "i", channel: "linkedin", title: "Alt", text: "body", imageUrl: "/api/media/x.png" },
        imageBytes: Buffer.from([1, 2, 3]),
      }),
    );

    expect(res.externalPostId).toBe(postUrn);
    expect(fetchMock).toHaveBeenCalledTimes(3);

    // Step A → initializeUpload з owner = author.
    const [initUrl, initOpts] = fetchMock.mock.calls[0];
    expect(initUrl).toBe("https://api.linkedin.com/rest/images?action=initializeUpload");
    expect(JSON.parse(initOpts.body as string)).toEqual({
      initializeUploadRequest: { owner: "urn:li:person:ABC" },
    });

    // Step B → PUT на uploadUrl, ЛИШЕ Authorization (без version/restli/json-хедерів).
    const [putUrl, putOpts] = fetchMock.mock.calls[1];
    expect(putUrl).toBe("https://dms.example/upload/0");
    expect(putOpts.method).toBe("PUT");
    expect(putOpts.headers).toEqual({ Authorization: "Bearer tok-123" });

    // Step C → payload з content.media.id = image URN, altText = title.
    const [, postOpts] = fetchMock.mock.calls[2];
    const body = JSON.parse(postOpts.body as string);
    expect(body.content).toEqual({ media: { altText: "Alt", id: imageUrn } });
  });

  it("throws a retryable error on 429 and 5xx, non-retryable on 400", async () => {
    for (const status of [429, 500, 503]) {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(fakeResponse({ status, text: "throttled" }));
      vi.stubGlobal("fetch", fetchMock);
      const pub = makeLinkedInPublisher(VERSION);
      await expect(pub.publish(baseInput())).rejects.toMatchObject({ retryable: true, status });
      vi.unstubAllGlobals();
    }

    const fetch400 = vi
      .fn()
      .mockResolvedValueOnce(fakeResponse({ status: 400, text: "FIELD_LENGTH_TOO_LONG" }));
    vi.stubGlobal("fetch", fetch400);
    const pub = makeLinkedInPublisher(VERSION);
    await expect(pub.publish(baseInput())).rejects.toMatchObject({ retryable: false, status: 400 });
  });

  it("fails when content is empty (no title/text)", async () => {
    const pub = makeLinkedInPublisher(VERSION);
    await expect(
      pub.publish(baseInput({ item: { id: "i", channel: "linkedin", title: null, text: null, imageUrl: null } })),
    ).rejects.toThrow(/порожній контент/);
  });

  it("fails when the connection has no author URN", async () => {
    const pub = makeLinkedInPublisher(VERSION);
    await expect(
      pub.publish(baseInput({ connection: { accessToken: "t" } })),
    ).rejects.toThrow(/author URN/);
  });

  it("uses the organization URN when meta.authorType is organization", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(fakeResponse({ status: 201, headers: { "x-restli-id": "urn:li:share:1" } }));
    vi.stubGlobal("fetch", fetchMock);
    const pub = makeLinkedInPublisher(VERSION);
    await pub.publish(
      baseInput({
        connection: {
          accessToken: "t",
          externalAccountId: "urn:li:person:ABC",
          meta: { authorType: "organization", organizationUrn: "urn:li:organization:42" },
        },
      }),
    );
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.author).toBe("urn:li:organization:42");
  });

  it("throws when 201 has no x-restli-id header", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(fakeResponse({ status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    const pub = makeLinkedInPublisher(VERSION);
    await expect(pub.publish(baseInput())).rejects.toThrow(/x-restli-id/);
  });
});
