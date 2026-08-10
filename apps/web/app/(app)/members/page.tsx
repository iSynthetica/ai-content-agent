// «Команда» переїхала в консолідований хаб /settings (§settings-hub). Лишаємо тонкий редірект, щоб
// старі закладки/лінки не ламались.
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function MembersRedirect() {
  redirect("/settings");
}
