// Реєстр публікаторів (§publishing foundation §4.1). ПОРОЖНІЙ у foundation-фазі: адаптер-фази
// (linkedin/twitter/instagram) додають сюди по одному запису — це ЄДИНИЙ спільний шов між ними,
// тож merge-конфлікт мінімальний (по одному рядку на адаптер).
//
// Форма одного запису (шов для адаптера — ЗАПОВНЮЙ ТУТ):
//   import { LinkedInPublisher } from "./linkedin.js";
//   publisherRegistry.linkedin = new LinkedInPublisher();
//
// Порожній реєстр — коректний стан: хендлер, не знайшовши публікатора, позначає публікацію
// failed "provider not implemented yet" (жодного падіння job'и).
import type { PublishProvider } from "@forteq/shared";
import type { Publisher } from "./types.js";

// Partial, а не повний Record: у foundation-фазі жодного ключа нема, і кожен адаптер додає СВІЙ.
// Повний Record<PublishProvider, Publisher> тут був би брехнею типів (усі три ключі порожні).
export type PublisherRegistry = Partial<Record<PublishProvider, Publisher>>;

// Мутабельний синглтон: composition інжектить його у HandlerContext, адаптер-фази заповнюють.
export const publisherRegistry: PublisherRegistry = {};

// Геттер: повертає публікатор або undefined (порожній реєстр / нереалізований провайдер).
export function getPublisher(
  registry: PublisherRegistry,
  provider: PublishProvider,
): Publisher | undefined {
  return registry[provider];
}
