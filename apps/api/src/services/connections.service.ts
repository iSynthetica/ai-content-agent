import { decryptSecret, encryptSecret } from "@forteq/db";
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
import { oauthProviders } from "../lib/oauth/providers";
import type { AccountIdentity, OAuthCreds } from "../lib/oauth/types";
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
    appConfigured: m.appConfigured,
    appClientId: m.appClientId,
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

  // Платформенні env-креди провайдера (тихий fallback, коли орендар не приніс свій застосунок).
  // Читаються синхронно з config; null, якщо котроїсь із двох немає.
  private envCreds(provider: PublishProvider): OAuthCreds | null {
    const pair: Record<PublishProvider, [string | undefined, string | undefined]> = {
      linkedin: [this.config.LINKEDIN_CLIENT_ID, this.config.LINKEDIN_CLIENT_SECRET],
      twitter: [this.config.X_CLIENT_ID, this.config.X_CLIENT_SECRET],
      instagram: [this.config.IG_CLIENT_ID, this.config.IG_CLIENT_SECRET],
    };
    const [clientId, clientSecret] = pair[provider];
    return clientId && clientSecret ? { clientId, clientSecret } : null;
  }

  // Резолвить OAuth-креди для флоу: КРЕДИ ОРЕНДАРЯ (з БД, secret розшифровується master-ключем) у
  // пріоритеті → інакше платформенні env → інакше null (провайдер не сконфігуровано). Виклик уже під
  // request-scope (репо на tx); decrypt — у пам'яті. Використовується startAuthorize і callback'ом.
  async resolveCreds(ctx: AuthCtx, provider: PublishProvider): Promise<OAuthCreds | null> {
    const row = await this.serviceConnections.getAppCredentials(ctx.accountId, provider);
    if (row?.appClientId && row.appClientSecretCt) {
      return {
        clientId: row.appClientId,
        clientSecret: decryptSecret(row.appClientSecretCt, this.masterKey),
      };
    }
    return this.envCreds(provider);
  }

  async list(ctx: AuthCtx): Promise<ConnectionsResponse> {
    const rows = await this.serviceConnections.list(ctx.accountId);
    // configured (per-tenant): провайдер сконфігуровано, якщо resolveCreds для нього вдався б — тобто
    // орендар увів креди застосунку (рядок з appConfigured) АБО присутні платформенні env-креди. Один
    // прохід: рядки вже прочитані, env читаємо синхронно (без N+1/decrypt — секрет тут не потрібен).
    const byProvider = new Map(rows.map((r) => [r.provider, r]));
    const configured: ConnectionProvider[] = [];
    for (const p of PUBLISH_PROVIDERS) {
      const appConfigured = byProvider.get(p)?.appConfigured ?? false;
      if (appConfigured || this.envCreds(p)) configured.push(p);
    }
    configured.push("telegram"); // серверних кред не потребує — завжди configured
    return { items: rows.map(toDTO), configured };
  }

  // BYO-app: орендар вводить креди власного OAuth-застосунку. Секрет шифрується на запис (master-ключ,
  // як BYOK LLM-ключі); repo зберігає лише шифротекст. telegram не має OAuth-застосунку → 422.
  async setAppCredentials(
    ctx: AuthCtx,
    provider: string,
    input: { clientId: string; clientSecret: string },
  ): Promise<void> {
    if (!(PUBLISH_PROVIDERS as readonly string[]).includes(provider)) {
      throw AppError.unprocessable(`provider '${provider}' does not use OAuth app credentials`);
    }
    const clientId = input.clientId.trim();
    const clientSecret = input.clientSecret.trim();
    if (!clientId || !clientSecret) throw AppError.unprocessable("client id/secret не можуть бути порожніми");
    const secretCt = encryptSecret(clientSecret, this.masterKey).ciphertext;
    await this.serviceConnections.setAppCredentials(ctx.accountId, provider, clientId, secretCt);
  }

  // Стартує OAuth: резолвить креди (орендар→env), будує consent-URL + підписаний state/PKCE-cookie.
  // Контролер ставить setCookie у відповідь і повертає { authUrl } браузеру (той редіректиться на
  // провайдера). Без кред → 422 (спершу треба ввести ключі застосунку).
  async startAuthorize(
    ctx: AuthCtx,
    provider: PublishProvider,
  ): Promise<{ authUrl: string; setCookie: string }> {
    const cfg = oauthProviders(this.config)[provider];
    if (!cfg) throw AppError.unprocessable(`provider '${provider}' is not configured`);
    const creds = await this.resolveCreds(ctx, provider);
    if (!creds) throw AppError.unprocessable("спершу введіть ключі застосунку");
    const state = generateState();
    const pkce = cfg.usesPkce ? generatePkce() : undefined;
    const authUrl = buildAuthorizeUrl(cfg, creds.clientId, state, pkce);
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

  // Валідація bot-token через Bot API getMe. Свідомо СТАТИЧНИЙ хелпер (без БД/txn): мережевий виклик
  // мусить бути ПОЗА request-txn (hard-boundary #4), тож контролер кличе його ДО openScope — точно як
  // OAuth-callback робить exchangeCode/fetchAccountIdentity перед короткою txn saveConnection.
  // Повертає @username бота (для показу в UI); кидає 422 на невалідний токен.
  static async validateTelegramToken(botToken: string): Promise<{ username: string | null }> {
    let res: Response;
    try {
      // Короткий таймаут: config-екшн не має висіти, якщо Telegram недоступна.
      res = await fetch(`https://api.telegram.org/bot${botToken.trim()}/getMe`, {
        method: "GET",
        signal: AbortSignal.timeout(5000),
      });
    } catch {
      // Мережева помилка/таймаут — трактуємо як невалідну конфігурацію (токен не підтверджено).
      throw AppError.unprocessable("невалідний bot token");
    }
    if (!res.ok) throw AppError.unprocessable("невалідний bot token");
    const json = (await res.json().catch(() => null)) as
      | { ok?: boolean; result?: { username?: string } }
      | null;
    if (!json || json.ok !== true) throw AppError.unprocessable("невалідний bot token");
    const username = json.result?.username ?? null;
    return { username: username ? `@${username}` : null };
  }

  // Telegram: не OAuth — «connection» це bot token (шифрується) + chat id (external_account_id).
  // Токен уже провалідовано в контролері (getMe ПОЗА txn); сюди приходить готова назва бота для UI.
  async configureTelegram(
    ctx: AuthCtx,
    botToken: string,
    chatId: string,
    externalAccountName: string | null,
  ): Promise<void> {
    const enc = encryptSecret(botToken.trim(), this.masterKey);
    await this.serviceConnections.upsert(ctx.accountId, {
      provider: "telegram",
      status: "connected",
      accessTokenCt: enc.ciphertext,
      refreshTokenCt: null,
      externalAccountId: chatId.trim(),
      externalAccountName,
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
