import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clampCaption,
  flattenCaption,
  makeInstagramPublisher,
} from "../src/lib/publishers/instagram";
import type { PublishInput } from "../src/lib/publishers/types";

// Офлайн-тест Instagram-публікатора (§publishing/03-instagram §4): без мережі, fetch замоканий.
// Перевіряємо: мапінг підпису (title+text, markdown→plain), клампінг ~2200, ОБОВʼЯЗКОВІСТЬ зображення,
// послідовність create-container → status(FINISHED) → media_publish → permalink, статус ERROR,
// класифікацію помилок (429 retryable / 400 ні).

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

function baseInput(overrides: Partial<PublishInput> = {}): PublishInput {
  return {
    item: { id: "item-1", channel: "instagram", title: null, text: "Привіт зі світу", imageUrl: "/api/media/run-1/d1.png" },
    imageBytes: undefined,
    publicImageUrl: "https://saas.forteqsolution.com/api/media/public/tok.sig",
    connection: {
      accessToken: "PAGE_TOKEN",
      externalAccountId: "ig-123",
      meta: { igUserId: "ig-123", pageId: "pg-1" },
    },
    ...overrides,
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("flattenCaption / clampCaption", () => {
  it("склеює title+text і прибирає markdown, лишає хештеги/URL", () => {
    const out = flattenCaption("# Заголовок", "**жирний** текст https://x.io #tag");
    expect(out).toBe("Заголовок\n\nжирний текст https://x.io #tag");
  });
  it("клампить по межі слова з …", () => {
    const long = "слово ".repeat(500);
    const out = clampCaption(long, 50);
    expect(out.length).toBeLessThanOrEqual(51);
    expect(out.endsWith("…")).toBe(true);
  });
});

describe("makeInstagramPublisher.publish", () => {
  it("падає без publicImageUrl (зображення обовʼязкове)", async () => {
    const pub = makeInstagramPublisher("v21.0");
    await expect(pub.publish(baseInput({ publicImageUrl: undefined }))).rejects.toThrow(/зображення/);
  });

  it("проходить два кроки й повертає media id + permalink", async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        calls.push(url);
        if (url.includes("media_publish")) return fakeResponse({ json: { id: "media-9" } });
        if (url.includes("status_code")) return fakeResponse({ json: { status_code: "FINISHED" } });
        if (url.includes("permalink")) return fakeResponse({ json: { permalink: "https://www.instagram.com/p/AbC" } });
        // create-container
        return fakeResponse({ json: { id: "creation-7" } });
      }),
    );
    const pub = makeInstagramPublisher("v21.0");
    const res = await pub.publish(baseInput());
    expect(res).toEqual({ externalPostId: "media-9", externalUrl: "https://www.instagram.com/p/AbC" });
    // create-container несе image_url + caption; media_publish — creation_id.
    const createCall = calls.find((c) => c.includes("/ig-123/media?"))!;
    expect(createCall).toContain("image_url=");
    expect(createCall).toContain("access_token=PAGE_TOKEN");
    const publishCall = calls.find((c) => c.includes("media_publish"))!;
    expect(publishCall).toContain("creation_id=creation-7");
  });

  it("кидає на статусі контейнера ERROR", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("status_code")) return fakeResponse({ json: { status_code: "ERROR" } });
        return fakeResponse({ json: { id: "creation-7" } });
      }),
    );
    const pub = makeInstagramPublisher("v21.0");
    await expect(pub.publish(baseInput())).rejects.toThrow(/ERROR/);
  });

  it("класифікує помилку create-container: 429 retryable, 400 — ні", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => fakeResponse({ status: 429, text: "rate" })));
    const pub = makeInstagramPublisher("v21.0");
    await expect(pub.publish(baseInput())).rejects.toMatchObject({ retryable: true, status: 429 });

    vi.stubGlobal("fetch", vi.fn(async () => fakeResponse({ status: 400, text: "bad" })));
    await expect(pub.publish(baseInput())).rejects.toMatchObject({ retryable: false, status: 400 });
  });
});
