// Порт публікатора (§publishing foundation §4.1) — ЄДИНИЙ контракт, який реалізує кожен
// адаптер соцмережі (linkedin/twitter/instagram) у фазі B. Хендлер content.publish резолвить
// байти зображення / connection ДО виклику й передає їх сюди готовими — адаптер лише формує
// пост-запит до зовнішнього API та повертає id/URL опублікованого поста.
import type { Channel } from "@forteq/shared";

export interface PublishInput {
  // Знімок content_items-рядка (лише поля, потрібні для посту). imageUrl — публічний шлях
  // /api/media/<key>; байти вже прочитані хендлером у imageBytes (адаптер їх не читає з диска).
  item: {
    id: string;
    channel: Channel;
    title: string | null;
    text: string | null;
    imageUrl: string | null;
  };
  // Байти зображення (якщо item.imageUrl заданий і хендлер зміг їх прочитати). X/LinkedIn —
  // опційно; Instagram вимагає зображення (адаптер сам валідує його наявність).
  imageBytes?: Buffer;
  // Абсолютний публічний URL зображення (карбує хендлер за MEDIA_SIGNING_SECRET/PUBLIC_MEDIA_BASE_URL).
  // Потрібен саме Instagram (Graph API приймає URL, не байти) — тому окремо від imageBytes.
  publicImageUrl?: string;
  // Розшифрований connection орендаря (токени в пам'яті; у payload/checkpointer НЕ потрапляють, §ADR-0016).
  connection: {
    accessToken: string;
    refreshToken?: string;
    externalAccountId?: string;
    meta?: Record<string, unknown>;
  };
}

export interface PublishResult {
  externalPostId: string;
  externalUrl: string;
}

export interface Publisher {
  publish(input: PublishInput): Promise<PublishResult>;
}
