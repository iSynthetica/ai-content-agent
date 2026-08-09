// «Підключення» переїхали в консолідований хаб /settings (§settings-hub). Лишаємо тонкий редірект,
// щоб старі закладки не ламались.
//
// Важливо: OAuth-callback (в apps/api, поза скоупом) повертає 302 на /connections?connected=<provider>
// (або ?error=<code>). Тому ПЕРЕНОСИМО ці query у ціль редіректу — тоді на хабі активується таб
// «Підключення», ConnectionsManager.useCallbackToast зчитає connected/error і покаже тост, як раніше.
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function ConnectionsRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const params = new URLSearchParams({ tab: "connections" });
  const connected = Array.isArray(sp.connected) ? sp.connected[0] : sp.connected;
  const error = Array.isArray(sp.error) ? sp.error[0] : sp.error;
  if (connected) params.set("connected", connected);
  if (error) params.set("error", error);
  redirect(`/settings?${params.toString()}`);
}
