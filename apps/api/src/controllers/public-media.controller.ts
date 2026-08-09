import type { Request, Response } from "express";
import { z } from "zod";
import sharp from "sharp";
import { verifyMediaToken } from "@forteq/shared/media-token";
import type { Composition } from "../composition";
import { asyncHandler } from "../http/async-handler";
import { AppError } from "../http/errors";

// GET /v1/media/public/:token — ПУБЛІЧНА роздача зображення поста БЕЗ cookie-сесії (§publishing,
// master-plan §2 п.5). Навіщо: Instagram тягне зображення СЕРВЕРОМ Meta за URL, а не браузером із
// сесією. Авторизація — сам підписаний токен (HMAC + TTL), тож роут монтується ПЕРЕД auth-middleware
// (див. server.ts). Транскод у JPEG: Meta не приймає PNG-прозорість; sharp гарантує чистий image/jpeg.
const tokenParam = z.string().min(1).max(2048);

export function publicMediaController(root: Composition) {
  const secret = root.config.MEDIA_SIGNING_SECRET;

  return {
    serve: asyncHandler(async (req: Request, res: Response) => {
      const token = tokenParam.parse(req.params.token);

      // Підпис/строк перевіряємо ДО дотику до ФС. Підроблений/прострочений → 404 (не 401): не
      // зізнаємось, чи існує ключ, і не даємо зондувати сховище.
      const verified = verifyMediaToken(token, secret);
      if (!verified) throw AppError.notFound("media");

      let bytes: Buffer;
      try {
        bytes = await root.ports.imageStorage.read(verified.key);
      } catch (err) {
        // Токен валідний, а файлу на томі нема (розбіжність БД↔ФС / том відвалився): 404, але
        // ГОЛОСНО логуємо (ADR-0014: тихий фолбек — ворог).
        root.logger.warn({ err, key: verified.key }, "public media: токен валідний, файлу нема");
        throw AppError.notFound("media");
      }

      const jpeg = await sharp(bytes).jpeg().toBuffer();
      res.setHeader("Content-Type", "image/jpeg");
      // Приватний короткий кеш: rerun може перемалювати той самий ключ, тож immutable було б брехнею.
      res.setHeader("Cache-Control", "private, max-age=300");
      res.status(200).send(jpeg);
    }),
  };
}
