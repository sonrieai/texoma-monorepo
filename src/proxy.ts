import { NextResponse, type NextRequest } from "next/server";
import { accessForEmail } from "@/lib/auth/access";
import { isAuthEnabled } from "@/lib/auth/config";
import { canAccess } from "@/lib/auth/roles";
import {
  getSessionCookieName,
  verifySessionToken,
} from "@/lib/auth/session";

function isPublicPath(pathname: string): boolean {
  if (pathname === "/login") return true;
  if (pathname === "/forgot-password") return true;
  if (pathname === "/reset-password") return true;
  if (pathname.startsWith("/api/auth/")) return true;
  return false;
}

function clearSession(response: NextResponse): NextResponse {
  response.cookies.set(getSessionCookieName(), "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return response;
}

function deny(request: NextRequest, pathname: string, home: string) {
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return NextResponse.redirect(new URL(home, request.url));
}

function continueWithPath(request: NextRequest) {
  const headers = new Headers(request.headers);
  headers.set("x-pathname", request.nextUrl.pathname);
  return NextResponse.next({ request: { headers } });
}

export async function proxy(request: NextRequest) {
  if (!isAuthEnabled()) {
    return continueWithPath(request);
  }

  const pathname = request.nextUrl.pathname;
  const token = request.cookies.get(getSessionCookieName())?.value;
  const session = await verifySessionToken(token);

  if (session && (pathname === "/login" || pathname === "/forgot-password")) {
    const access = await accessForEmail(session.email);
    if (!access) return clearSession(continueWithPath(request));
    if (access.homePath.startsWith("/login")) return continueWithPath(request);
    return NextResponse.redirect(new URL(access.homePath, request.url));
  }

  if (isPublicPath(pathname)) {
    return continueWithPath(request);
  }

  if (!session) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const loginUrl = new URL("/login", request.url);
    const callback = `${pathname}${request.nextUrl.search}`;
    if (callback !== "/") {
      loginUrl.searchParams.set("callbackUrl", callback);
    }
    return NextResponse.redirect(loginUrl);
  }

  const access = await accessForEmail(session.email);
  if (!access) {
    if (pathname.startsWith("/api/")) {
      return clearSession(
        NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
      );
    }
    return clearSession(NextResponse.redirect(new URL("/login", request.url)));
  }

  const allowed = access.role
    ? canAccess(access.role, pathname, access.providerId)
    : false;

  if (!allowed) return deny(request, pathname, access.homePath);
  return continueWithPath(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
