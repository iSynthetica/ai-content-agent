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

    // Bot API sendMessage. parse_mode HTML: у тексті лише статичні теги, які ми контролюємо —
    // динамічних рядків тут нема, тож екранувати нічого (додаткові дані вставляй лише через esc &<>).
    // URL — у кнопці inline_keyboard, він НЕ парситься як текст, тож екранування не потребує.
    // botToken свідомо потрапляє ЛИШЕ в URL запиту й НІКОЛИ в логи (секрет).
    const body = {
      chat_id: row.chatId,
      text: "🟢 <b>Контент готовий до перевірки.</b>",
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
      reply_markup: {
        inline_keyboard: [[{ text: "Переглянути", url: reviewUrl }]],
      },
    };

    // Захисний таймаут: зависла Telegram не має стопорити воркер. Будь-який збій — лише лог (нижче).
    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) {
      // Тіло відповіді Bot API безпечно логувати (токен у ньому не повторюється); URL — НЕ логуємо.
      const respBody = await res.text().catch(() => "");
      ctx.logger.warn(
        { runId, chatId: row.chatId, status: res.status, body: respBody },
        "telegram sendMessage failed",
      );
      return;
    }
    ctx.logger.info(
      { runId, chatId: row.chatId },
      "telegram notify: контент готовий до рецензії — sendMessage надіслано",
    );
  } catch (e) {
    // Інваріант: збій сповіщення НЕ валить прогін.
    ctx.logger.warn(
      { runId, err: e instanceof Error ? e.message : String(e) },
      "telegram notify пропущено (помилка)",
    );
  }
}
