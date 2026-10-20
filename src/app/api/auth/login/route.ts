import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { verifyLogin } from "@/lib/auth/credentials";
import { isAuthEnabled, SESSION_MAX_AGE_SEC } from "@/lib/auth/config";
import { landingPath } from "@/lib/auth/roles";
import { findDashboardUserById } from "@/lib/auth/users";
import {
  createSessionToken,
  getSessionCookieName,
  sessionCookieOptions,
} from "@/lib/auth/session";

export const dynamic = "force-dynamic";

type LoginBody = {
  email?: string;
  password?: string;
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function redirectTo(request: Request, path: string) {
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
  const proto = request.headers.get("x-forwarded-proto") || "http";
  if (host) {
    return NextResponse.redirect(`${proto}://${host}${path}`, 303);
  }
  return NextResponse.redirect(new URL(path, request.url), 303);
}

export async function POST(request: Request) {
  if (!isAuthEnabled()) {
    return NextResponse.json(
      {
        ok: false,
        error: "Authentication is not configured. Set AUTH_SESSION_SECRET.",
      },
      { status: 503 },
    );
  }

  const contentType = request.headers.get("content-type") ?? "";
  const isForm =
    contentType.includes("application/x-www-form-urlencoded") ||
    contentType.includes("multipart/form-data");

  let body: LoginBody;
  try {
    if (isForm) {
      const form = await request.formData();
      body = {
        email: String(form.get("email") ?? ""),
        password: String(form.get("password") ?? ""),
      };
    } else {
      body = (await request.json()) as LoginBody;
    }
  } catch {
    if (isForm) {
      return redirectTo(request, "/login?error=invalid");
    }
    return NextResponse.json(
      { ok: false, error: "Invalid request body" },
      { status: 400 },
    );
  }

  const email = body.email?.trim().toLowerCase() ?? "";
  const password = body.password ?? "";

  if (!email || !password) {
    if (isForm) {
      return redirectTo(request, "/login?error=invalid");
    }
    return NextResponse.json(
      { ok: false, error: "Email and password are required" },
      { status: 400 },
    );
  }

  if (!EMAIL_PATTERN.test(email)) {
    if (isForm) {
      return redirectTo(request, "/login?error=invalid");
    }
    return NextResponse.json(
      { ok: false, error: "A valid email address is required" },
      { status: 400 },
    );
  }

  const verified = await verifyLogin(email, password);
  if (!verified) {
    if (isForm) {
      return redirectTo(request, "/login?error=invalid");
    }
    return NextResponse.json(
      { ok: false, error: "Invalid email or password" },
      { status: 401 },
    );
  }

  const token = await createSessionToken(verified.email);
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_SEC * 1000);

  const cookieStore = await cookies();
  cookieStore.set(getSessionCookieName(), token, sessionCookieOptions(expiresAt));

  const user = await findDashboardUserById(verified.userId);
  const role = user?.role ?? "insurance";
  const providerId = user?.providerId ?? null;

  const homePath = landingPath(role, providerId);
  if (isForm) {
    return redirectTo(request, homePath);
  }

  return NextResponse.json({
    ok: true,
    email: verified.email,
    role,
    providerId,
    homePath,
  });
}
