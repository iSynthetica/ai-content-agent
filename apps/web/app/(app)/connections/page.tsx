// «Підключення» тепер company-scoped (§per-company-settings): живуть під
// /companies/[companyId]/settings?tab=connections, і саме туди редіректить OAuth-callback (companyId
// відновлюється зі state-cookie). Ця account-рівнева сторінка більше не існує — лишаємо тонкий
// редірект на /settings, щоб старі закладки не ламались.
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function ConnectionsRedirect() {
  redirect("/settings");
}
