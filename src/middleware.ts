import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/session";

// Every page needs a valid session. Fine-grained role checks happen in pages and actions.
export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const session = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);

  // The login page decides for itself (it can check the database); the cookie alone may be stale,
  // e.g. after a password reset or deactivation, and bouncing it here would loop.
  if (pathname === "/login") return NextResponse.next();
  if (!session) {
    const url = new URL("/login", req.url);
    if (pathname !== "/") url.searchParams.set("next", pathname + search);
    return NextResponse.redirect(url);
  }
  if (session.mustChange && pathname !== "/account") {
    return NextResponse.redirect(new URL("/account?first=1", req.url));
  }
  return NextResponse.next();
}

export const config = {
  // Skip static assets and the cron endpoints (they use their own secret).
  matcher: ["/((?!_next/|api/cron/|favicon.ico|manifest.webmanifest|.*\\.(?:png|svg|ico|jpg|webp)$).*)"],
};
