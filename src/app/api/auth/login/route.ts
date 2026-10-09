import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { verifyLogin } from "@/lib/auth/credentials";
import { isAuthEnabled, SESSION_MAX_AGE_SEC } from "@/lib/auth/config";
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

  let body: LoginBody;
  try {
    body = (await request.json()) as LoginBody;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid request body" },
      { status: 400 },
    );
  }

  const email = body.email?.trim().toLowerCase() ?? "";
  const password = body.password ?? "";

  if (!email || !password) {
    return NextResponse.json(
      { ok: false, error: "Email and password are required" },
      { status: 400 },
    );
  }

  if (!EMAIL_PATTERN.test(email)) {
    return NextResponse.json(
      { ok: false, error: "A valid email address is required" },
      { status: 400 },
    );
  }

  const verified = await verifyLogin(email, password);
  if (!verified) {
    return NextResponse.json(
      { ok: false, error: "Invalid email or password" },
      { status: 401 },
    );
  }

  const token = await createSessionToken(verified.email);
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_SEC * 1000);

  const cookieStore = await cookies();
  cookieStore.set(getSessionCookieName(), token, sessionCookieOptions(expiresAt));

  return NextResponse.json({ ok: true, email: verified.email });
}
