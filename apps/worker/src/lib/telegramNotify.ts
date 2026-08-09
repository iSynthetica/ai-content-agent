// Telegram-нотифікація "контент готовий до рецензії" (§publishing foundation §5, 04-telegram §3-4).
//
// Telegram — НЕ публікатор, а best-effort side-channel: коли прогін дійшов до needs_review, шлемо
// орендарю в його Telegram нагадування з deep-link на сторінку рецензії. Викликається ПІСЛЯ
// персист-txn (поза транзакцією — boundary #4) у start.ts/resume.ts, поряд із enqueueVisuals.
//
// Головний інваріант notify.ts: збій сповіщення НЕ валить прогін. Тому вся функція обгорнута у
// try/catch і НІКОЛИ не кидає.
import { and, eq } from "drizzle-orm";
import { serviceConnections, decryptSecret } from "@forteq/db";
import { withAccountScope, type HandlerContext } from "../composition.js";

/**
 * Best-effort Telegram-пінг про готовність контенту до рецензії. Тиха відсутність конекшена — норма
 * (орендар його не налаштував). Реальний Bot API sendMessage додає Telegram-фаза (див. TODO нижче).
 */
export async function notifyTelegramReady(
  ctx: HandlerContext,
  accountId: string,
  runId: string,
): Promise<void> {
  try {
    // Fake-режим: master-ключа нема → нічим розшифрувати bot-token, тихо виходимо (пінги не летять).
    if (!ctx.masterKey) return;

    // КОРОТКА scoped-txn: читаємо конекшн telegram (як loadTenantSecrets). HTTP — вже ПОЗА txn.
    const row = await withAccountScope(ctx, accountId, async (tx) => {
      const rows = await tx
        .select({
          tokenCt: serviceConnections.accessTokenCt,
          chatId: serviceConnections.externalAccountId,
          status: serviceConnections.status,
        })
        .from(serviceConnections)
        .where(
          and(eq(serviceConnections.accountId, accountId), eq(serviceConnections.provider, "telegram")),
        )
        .limit(1);
      return rows[0];
    });

    // Не налаштовано / відключено — нічого не робимо.
    if (!row || !row.tokenCt || !row.chatId || row.status !== "connected") return;

    // Розшифровуємо bot-token у пам'яті (у логи він НЕ потрапляє — лише статус/chatId).
    const botToken = decryptSecret(row.tokenCt, ctx.masterKey);
    // Deep-link веде у ВЕБ-застосунок (/runs/<id>), не в api — тому PUBLIC_APP_URL, а не media base.
    const reviewUrl = `${ctx.env.PUBLIC_APP_URL}/runs/${runId}`;

    // TODO(telegram-phase): замінити цей лог на реальний виклик Bot API
    //   POST https://api.telegram.org/bot<botToken>/sendMessage
    //   { chat_id: row.chatId, text: "<N> posts ready for review", parse_mode: "HTML",
    //     link_preview_options: { is_disabled: true },
    //     reply_markup: { inline_keyboard: [[{ text: "Open review", url: reviewUrl }]] } }
    // Best-effort: HTTP-помилку лише логувати; 401/403/400 → позначити конекшн 'error' для UI.
    // botToken тут свідомо НЕ логуємо (секрет); фаза Telegram використає його лише в URL запиту.
    void botToken;
    ctx.logger.info(
      { runId, chatId: row.chatId, reviewUrl },
      "telegram notify (заглушка): контент готовий до рецензії — sendMessage додасть Telegram-фаза",
    );
  } catch (e) {
    // Інваріант: збій сповіщення НЕ валить прогін.
    ctx.logger.warn(
      { runId, err: e instanceof Error ? e.message : String(e) },
      "telegram notify пропущено (помилка)",
    );
  }
}
