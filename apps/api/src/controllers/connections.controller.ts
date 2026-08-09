import type { Request, Response } from "express";
import { z } from "zod";
import {
  connectionProviderSchema,
  publishProviderSchema,
  setAppCredentialsRequest,
  telegramConfigRequest,
} from "@forteq/shared";
import type { Composition } from "../composition";
import { ConnectionsService } from "../services/connections.service";
import { asyncHandler } from "../http/async-handler";
import { requireAuth } from "../http/middlewares/auth";
import { oauthProviders } from "../lib/oauth/providers";
import { exchangeCode } from "../lib/oauth/exchange";
import { clearStateSetCookie, readStateCookie } from "../lib/oauth/state-cookie";

// Керування підключеннями (§publishing §3). list читає будь-який член; authorize/telegram/disconnect
// — connection:manage (роути). callback — під auth (сесія долітає з редіректом провайдера), БЕЗ
// permission-гварда: це технічний redirect-target, а не мутація-намір користувача.
export function connectionsController(root: Composition) {
  // OAuth-callback свідомо оркеструється У КОНТРОЛЕРІ (як media.controller фазить txn↔IO): звірка
  // cookie (чиста) + exchange/identity (HTTP, ПОЗА txn, hard-boundary #4) + коротка txn saveConnection.
  const stateSecret = root.config.OAUTH_STATE_SECRET ?? root.config.MEDIA_SIGNING_SECRET;
  const secureCookies = root.config.NODE_ENV === "production";
  const webBase = root.config.CORS_ORIGIN.replace(/\/$/, "");
  const redirectBack = (res: Response, query: string): void => {
    res.redirect(302, `${webBase}/connections?${query}`);
  };

  return {
    list: asyncHandler(async (req: Request, res: Response) => {
      const auth = requireAuth(req);
      const result = await root.openScope(auth, (s) => s.services.connections.list(auth));
      res.status(200).json(result);
    }),

    authorize: asyncHandler(async (req: Request, res: Response) => {
      const auth = requireAuth(req);
      const provider = publishProviderSchema.parse(req.params.provider);
      const { authUrl, setCookie } = await root.openScope(auth, async (s) =>
        s.services.connections.startAuthorize(auth, provider),
      );
      res.setHeader("Set-Cookie", setCookie);
      res.status(200).json({ authUrl });
    }),

    // BYO-app: орендар зберігає креди власного OAuth-застосунку (client id + secret). Секрет
    // шифрується у сервісі (master-ключ); назад НІКОЛИ не віддається (204).
    setAppCredentials: asyncHandler(async (req: Request, res: Response) => {
      const auth = requireAuth(req);
      const provider = publishProviderSchema.parse(req.params.provider);
      const body = setAppCredentialsRequest.parse(req.body);
      await root.openScope(auth, (s) =>
        s.services.connections.setAppCredentials(auth, provider, body),
      );
      res.status(204).end();
    }),

    // Redirect-target провайдера. НІКОЛИ не кидає у відповідь JSON-помилку — завжди редіректить
    // назад на web (/connections?error=<code>|connected=<provider>), щоб користувач не впав у API-500.
    callback: asyncHandler(async (req: Request, res: Response) => {
      const auth = requireAuth(req);
      // Одразу гасимо state-cookie (single-use), незалежно від результату.
      res.setHeader("Set-Cookie", clearStateSetCookie({ secure: secureCookies }));

      const providerParsed = publishProviderSchema.safeParse(req.params.provider);
      if (!providerParsed.success) return redirectBack(res, "error=unknown_provider");
      const provider = providerParsed.data;

      const query = z
        .object({ code: z.string().min(1), state: z.string().min(1) })
        .safeParse(req.query);
      if (!query.success) return redirectBack(res, `error=invalid_callback&provider=${provider}`);

      // CSRF: state з cookie має збігатися з ?state, а provider — з тим, під який відкрито flow.
      const payload = readStateCookie(req.headers.cookie, stateSecret);
      if (!payload || payload.provider !== provider || payload.state !== query.data.state) {
        return redirectBack(res, `error=state_mismatch&provider=${provider}`);
      }

      const cfg = oauthProviders(root.config)[provider];
      if (!cfg) return redirectBack(res, `error=not_configured&provider=${provider}`);

      // Резолвимо креди орендаря (→env) у КОРОТКІЙ txn ДО exchange (сам exchange — HTTP ПОЗА txn,
      // hard-boundary #4). Без кред → редірект not_configured (не запускаємо exchange наосліп).
      const creds = await root.openScope(auth, (s) =>
        s.services.connections.resolveCreds(auth, provider),
      );
      if (!creds) return redirectBack(res, `error=not_configured&provider=${provider}`);

      try {
        // HTTP ПОЗА будь-якою txn (hard-boundary #4). Кредами орендаря (BYO-app) або env-fallback.
        const tokens = await exchangeCode(cfg, creds, query.data.code, payload.verifier);
        const identity = await cfg.fetchAccountIdentity(creds, tokens.accessToken);
        // Коротка txn: шифруємо й upsert'имо (усередині сервісу з master-ключем).
        await root.openScope(auth, (s) =>
          s.services.connections.saveConnection(auth, provider, {
            accessToken: tokens.accessToken,
            refreshToken: tokens.refreshToken,
            expiresIn: tokens.expiresIn,
            scope: tokens.scope,
            identity,
          }),
        );
        return redirectBack(res, `connected=${provider}`);
      } catch (err) {
        root.logger.error({ err, provider, accountId: auth.accountId }, "OAuth callback failed");
        return redirectBack(res, `error=oauth_failed&provider=${provider}`);
      }
    }),

    telegram: asyncHandler(async (req: Request, res: Response) => {
      const auth = requireAuth(req);
      const body = telegramConfigRequest.parse(req.body);
      // Валідація токена (getMe) — HTTP ПОЗА txn (hard-boundary #4), як exchange у OAuth-callback вище.
      // Кидає 422 на невалідний токен ще до відкриття request-scope; повертає @username для UI.
      const { username } = await ConnectionsService.validateTelegramToken(body.botToken);
      await root.openScope(auth, (s) =>
        s.services.connections.configureTelegram(auth, body.botToken, body.chatId, username),
      );
      res.status(204).end();
    }),

    disconnect: asyncHandler(async (req: Request, res: Response) => {
      const auth = requireAuth(req);
      const provider = connectionProviderSchema.parse(req.params.provider);
      await root.openScope(auth, (s) => s.services.connections.disconnect(auth, provider));
      res.status(204).end();
    }),
  };
}
