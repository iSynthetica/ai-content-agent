// Unit — mediaController.serve (§4.3 роздача зображень). Найдорожче тут — крос-тенант захист і те,
// що баг «file:// у image_url» більше не повертається: перевіряємо, що віддаємо байти ЛИШЕ коли
// ключ належить орендарю (existsByImageUrl), і що невалідний/чужий шлях дає 404 БЕЗ дотику до ФС.
// Фейки на пам'яті, без Express-сервера: кличемо serve(req,res,next) напряму (asyncHandler кидає
// AppError у next).
import { describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";
import { mediaUrl } from "@forteq/shared";
import { mediaController } from "../src/controllers/media.controller";
import { AppError } from "../src/http/errors";
import type { Composition } from "../src/composition";
import type { AuthCtx } from "../src/di/types";

const ACCOUNT = "11111111-1111-1111-1111-111111111111";
const RUN_ID = "22222222-2222-2222-2222-222222222222";
const DRAFT_ID = "33333333-3333-3333-3333-333333333333";
const FILE = `${DRAFT_ID}.png`;
const KEY = `${RUN_ID}/${FILE}`;
const auth: AuthCtx = { accountId: ACCOUNT, userId: "u1", role: "viewer" };

// Мінімальний фейк Composition: openScope прокидає scope із лише потрібним репо; ports.imageStorage
// віддає задані байти або кидає (файла нема).
function makeRoot(opts: {
  ownedUrls: string[];
  bytesByKey?: Record<string, Buffer>;
}): Composition {
  const read = vi.fn(async (key: string): Promise<Buffer> => {
    const b = opts.bytesByKey?.[key];
    if (!b) throw new Error("ENOENT");
    return b;
  });
  const existsByImageUrl = vi.fn(async (accountId: string, url: string) =>
    accountId === ACCOUNT && opts.ownedUrls.includes(url),
  );
  const openScope = (async (_a: AuthCtx, fn: (s: unknown) => Promise<unknown>) =>
    fn({ repos: { contentItems: { existsByImageUrl } } })) as Composition["openScope"];
  return {
    ports: { imageStorage: { read } },
    logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
    openScope,
  } as unknown as Composition;
}

function makeReqRes(params: Record<string, string>) {
  const req = { params, auth } as unknown as Request;
  const res = {
    headers: {} as Record<string, string>,
    statusCode: 0,
    body: undefined as unknown,
    setHeader(k: string, v: string) {
      this.headers[k.toLowerCase()] = v;
    },
    status(c: number) {
      this.statusCode = c;
      return this;
    },
    send(b: unknown) {
      this.body = b;
      return this;
    },
  };
  return { req, res: res as unknown as Response & typeof res };
}

// serve обгорнутий asyncHandler → відхилення йде у next(err), тож ловимо next.
async function invoke(root: Composition, params: Record<string, string>) {
  const { req, res } = makeReqRes(params);
  let err: unknown;
  await new Promise<void>((resolve) => {
    (mediaController(root).serve as unknown as (r: Request, s: Response, n: (e?: unknown) => void) => void)(
      req,
      res,
      (e?: unknown) => {
        err = e;
        resolve();
      },
    );
    // happy-path не кличе next — даємо мікротаску завершитись
    setTimeout(resolve, 0);
  });
  return { res, err };
}

describe("mediaController.serve", () => {
  it("віддає байти й правильний Content-Type, коли ключ належить орендарю", async () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
    const root = makeRoot({ ownedUrls: [mediaUrl(KEY)], bytesByKey: { [KEY]: png } });
    const { res, err } = await invoke(root, { runId: RUN_ID, file: FILE });
    expect(err).toBeUndefined();
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toBe("image/png");
    expect(res.headers["cache-control"]).toContain("private");
    expect(res.body).toBe(png);
  });

  it("404, коли ключ НЕ належить орендарю (крос-тенант) — файл не читається", async () => {
    const png = Buffer.from([1, 2, 3]);
    const root = makeRoot({ ownedUrls: [], bytesByKey: { [KEY]: png } });
    const { err } = await invoke(root, { runId: RUN_ID, file: FILE });
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).status).toBe(404);
    expect(root.ports.imageStorage.read).not.toHaveBeenCalled();
  });

  it("404, коли рядок є, а файлу на томі нема (розбіжність БД↔ФС) — не 500", async () => {
    const root = makeRoot({ ownedUrls: [mediaUrl(KEY)] });
    const { err } = await invoke(root, { runId: RUN_ID, file: FILE });
    expect((err as AppError).status).toBe(404);
  });

  it("відкидає невалідний file (path-traversal / чужий формат) ще до ownership-перевірки", async () => {
    const root = makeRoot({ ownedUrls: [] });
    const { err } = await invoke(root, { runId: RUN_ID, file: "..%2f..%2fetc" });
    // zod parse кидає ZodError → next; головне, що байти не читались і 200 не віддано
    expect(err).toBeDefined();
    expect(root.ports.imageStorage.read).not.toHaveBeenCalled();
  });
});
