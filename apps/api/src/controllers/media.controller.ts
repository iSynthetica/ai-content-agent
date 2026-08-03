import type { Request, Response } from "express";
import { z } from "zod";
import { mediaUrl } from "@forteq/shared";
import type { Composition } from "../composition";
import { asyncHandler } from "../http/async-handler";
import { requireAuth } from "../http/middlewares/auth";
import { AppError } from "../http/errors";

// Роздача згенерованих зображень (баг зі звіту покупця: image_url раніше був file://, браузер його
// не тягнув). Ключ = `${runId}/${draftId}.${ext}` — рівно два сегменти (див. LocalImageStore у
// worker composition), тож роут — два явні параметри, а не wildcard: так drift-guard allowlist-у
// (concrete(:param)→uuid) лишається простим і чесним.
const runIdParam = z.string().uuid();
// file = `${draftId}.${ext}`; ext із extFromContentType воркера. Жорстко валідуємо — і як захист
// від path-traversal ще ДО дотику до ФС (хоч ownership-перевірка нижче й так відсікла б чуже).
const fileParam = z.string().regex(/^[0-9a-fA-F-]+\.(png|jpe?g|webp|bin)$/);

const CONTENT_TYPE_BY_EXT: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  bin: "application/octet-stream",
};

// GET /v1/media/:runId/:file — байти картинки поста. Публічний шлях (mediaUrl) веде сюди через
// web-BFF. За auth-middleware: браузер шле cookie-сесію разом із <img>-запитом (same-origin /api).
export function mediaController(root: Composition) {
  return {
    serve: asyncHandler(async (req: Request, res: Response) => {
      const auth = requireAuth(req);
      const runId = runIdParam.parse(req.params.runId);
      const file = fileParam.parse(req.params.file);
      const key = `${runId}/${file}`;

      // Ownership: чи належить ключ орендарю (RLS ізолює content_items за accountId). Немає рядка —
      // 404, навіть якщо файл фізично є на спільному томі (крос-тенант захист). Коротка txn, БЕЗ
      // читання файлу всередині (§hard-boundary 4: не тримати txn під час IO).
      const owned = await root.openScope(auth, (s) =>
        s.repos.contentItems.existsByImageUrl(auth.accountId, mediaUrl(key)),
      );
      if (!owned) throw AppError.notFound("image");

      // Байти читаємо ПІСЛЯ закриття txn. Рядок у БД є, а файлу нема — розбіжність БД↔ФС (том
      // не змонтовано, файл видалено): віддаємо 404 (не 500), але ГОЛОСНО логуємо — інакше «том
      // відвалився» виглядало б ззовні як «картинок просто нема» (ADR-0014: тихий фолбек — ворог).
      let bytes: Buffer;
      try {
        bytes = await root.ports.imageStorage.read(key);
      } catch (err) {
        root.logger.warn({ err, key, accountId: auth.accountId }, "media: рядок є, файлу на томі нема");
        throw AppError.notFound("image");
      }

      const ext = file.slice(file.lastIndexOf(".") + 1).toLowerCase();
      res.setHeader("Content-Type", CONTENT_TYPE_BY_EXT[ext] ?? "application/octet-stream");
      // Приватний короткий кеш: rerun може перемалювати той самий ключ (resume зануляє image_url і
      // job content.visuals пише знову), тож immutable було б брехнею.
      res.setHeader("Cache-Control", "private, max-age=300");
      res.status(200).send(bytes);
    }),
  };
}
