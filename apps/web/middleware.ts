// Захист роутів (spike-3 §5). Дешевий ПЕРШИЙ бар'єр: перевіряє лише ПРИСУТНІСТЬ сесійного
// cookie (не валідність — це робить api на кожному запиті). За відсутності → редірект на
// /login?next=<safe>. Matcher перелічує все, що треба захистити, ВИКЛЮЧАЮЧИ публічне й
// інфраструктурне: /login, /api/* (BFF сам форвардить cookie й повертає 401 — подвійний gate
// зламав би auth-флоу), /_next/*, статику, favicon.
import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth-constants";
import { safeNext } from "@/lib/safe-next";

export function middleware(req: NextRequest) {
  if (req.cookies.has(SESSION_COOKIE)) {
    return NextResponse.next();
  }
  const url = req.nextUrl.clone();
  const next = safeNext(url.pathname + url.search);
  url.pathname = "/login";
  url.search = next === "/" ? "" : `?next=${encodeURIComponent(next)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!login|api|_next/static|_next/image|favicon.ico).*)"],
};
