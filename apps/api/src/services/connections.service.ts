import { encryptSecret } from "@forteq/db";
import {
  PUBLISH_PROVIDERS,
  type ConnectionDTO,
  type ConnectionProvider,
  type ConnectionsResponse,
  type ConnectionStatus,
  type PublishProvider,
} from "@forteq/shared";
import { AppError } from "../http/errors";
import type { AppConfig } from "../config/env";
import type { AuthCtx } from "../di/types";
import type { ServiceConnectionMasked, ServiceConnectionsRepo } from "../repositories/interfaces";
import { isConfigured, oauthProviders } from "../lib/oauth/providers";
import type { AccountIdentity } from "../lib/oauth/types";
import { buildAuthorizeUrl } from "../lib/oauth/exchange";
import { generatePkce, generateState } from "../lib/oauth/pkce";
import {
  buildStateSetCookie,
  OAUTH_STATE_TTL_SEC,
  signState,
} from "../lib/oauth/state-cookie";

// Вхід збереження connection'а після успішного обміну (HTTP-частина — у контролері ПОЗА txn).
export interface SaveConnectionInput {
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number; // секунди до протухання
  scope?: string; // надані scope (рядок як прийшов від провайдера)
  identity: AccountIdentity;
}

function toDTO(m: ServiceConnectionMasked): ConnectionDTO {
  // provider/status приходять рядком із БД, але значення пишемо лише ми (валідні enum) — звужуємо.
  return {
    provider: m.provider as ConnectionProvider,
    status: m.status as ConnectionStatus,
    externalAccountId: m.externalAccountId,
    externalAccountName: m.externalAccountName,
    scopes: m.scopes,
    expiresAt: m.expiresAt,
    lastUsedAt: m.lastUsedAt,
    createdAt: m.createdAt,
  };
}

// Керування підключеннями соцмереж/Telegram (§publishing §3). Шифрування токенів на запис живе ТУТ
// (master-ключ із composition, як BYOK ApiKeysService); repo бачить лише готовий шифротекст і НІКОЛИ
// не віддає його назовні. OAuth-HTTP (exchange/identity) відбувається у контролері ПОЗА транзакцією
// (hard-boundary #4) — сюди приходить уже результат обміну для короткої txn-upsert'а.
export class ConnectionsService {
  constructor(
    private readonly serviceConnections: ServiceConnectionsRepo,
    private readonly masterKey: Buffer,
    private readonly config: AppConfig,
  ) {}

  // Секрет підпису state-cookie: окремий OAUTH_STATE_SECRET або реюз MEDIA_SIGNING_SECRET.
  private stateSecret(): string {
    return this.config.OAUTH_STATE_SECRET ?? this.config.MEDIA_SIGNING_SECRET;
  }

  private secureCookies(): boolean {
    return this.config.NODE_ENV === "production";
  }

  async list(ctx: AuthCtx): Promise<ConnectionsResponse> {
    const rows = await this.serviceConnections.list(ctx.accountId);
    // configured — провайдери, чиї СЕРВЕРНІ креди присутні (соцмережі) + завжди telegram (він
    // серверних кред не потребує). Фронт вимикає Connect для не-configured.
    const configured: ConnectionProvider[] = [];
    for (const p of PUBLISH_PROVIDERS) {
      if (isConfigured(this.config, p)) configured.push(p);
    }
    configured.push("telegram");
    return { items: rows.map(toDTO), configured };
  }

  // Стартує OAuth: будує consent-URL + підписаний state/PKCE-cookie. БЕЗ доступу до БД. Контролер
  // ставить setCookie у відповідь і повертає { authUrl } браузеру (той редіректиться на провайдера).
  startAuthorize(provider: PublishProvider): { authUrl: string; setCookie: string } {
    const cfg = oauthProviders(this.config)[provider];
    if (!cfg) {
      throw AppError.unprocessable(`provider '${provider}' is not configured`);
    }
    const state = generateState();
    const pkce = cfg.usesPkce ? generatePkce() : undefined;
    const authUrl = buildAuthorizeUrl(cfg, state, pkce);
    const exp = Math.floor(Date.now() / 1000) + OAUTH_STATE_TTL_SEC;
    const value = signState({ state, provider, verifier: pkce?.verifier, exp }, this.stateSecret());
    const setCookie = buildStateSetCookie(value, { secure: this.secureCookies() });
    return { authUrl, setCookie };
  }

  // Коротка txn-upsert після успішного обміну (виклик із контролера через openScope). Instagram:
  // identity.tokenOverride (Page access token) зберігається ЯК access_token — саме ним публікує
  // worker; OAuth-user-токен відкидаємо, а ідентичність лишаємо в meta (master-plan §2 п.4).
  async saveConnection(
    ctx: AuthCtx,
    provider: PublishProvider,
    input: SaveConnectionInput,
  ): Promise<void> {
    const accessPlain = input.identity.tokenOverride ?? input.accessToken;
    const accessCt = encryptSecret(accessPlain, this.masterKey).ciphertext;
    const refreshCt = input.refreshToken
      ? encryptSecret(input.refreshToken, this.masterKey).ciphertext
      : null;
    const expiresAt =
      input.expiresIn && input.expiresIn > 0
        ? new Date(Date.now() + input.expiresIn * 1000)
        : null;

    await this.serviceConnections.upsert(ctx.accountId, {
      provider,
      status: "connected",
      accessTokenCt: accessCt,
      refreshTokenCt: refreshCt,
      externalAccountId: input.identity.id,
      externalAccountName: input.identity.name,
      scopes: input.scope ?? null,
      expiresAt,
      meta: input.identity.meta ?? {},
    });
  }

  // Telegram: не OAuth — «connection» це bot token (шифрується) + chat id (external_account_id).
  async configureTelegram(ctx: AuthCtx, botToken: string, chatId: string): Promise<void> {
    // TODO(telegram-phase): валідувати botToken через Bot API getMe ПЕРЕД збереженням (foundation
    // §5) — стаб зараз просто зберігає; фаза Telegram додасть перевірку й, за потреби, назву бота.
    const enc = encryptSecret(botToken.trim(), this.masterKey);
    await this.serviceConnections.upsert(ctx.accountId, {
      provider: "telegram",
      status: "connected",
      accessTokenCt: enc.ciphertext,
      refreshTokenCt: null,
      externalAccountId: chatId.trim(),
      externalAccountName: null,
      scopes: null,
      expiresAt: null,
      meta: {},
    });
  }

  async disconnect(ctx: AuthCtx, provider: ConnectionProvider): Promise<void> {
    const ok = await this.serviceConnections.delete(ctx.accountId, provider);
    if (!ok) throw AppError.notFound("connection");
  }
}
