import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { isAuthEnabled, SESSION_MAX_AGE_SEC } from "@/lib/auth/config";
import { GUEST_SESSION_EMAIL } from "@/lib/auth/guest";
import {
  createSessionToken,
  getSessionCookieName,
  sessionCookieOptions,
} from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/** Sign in as a read-only guest. Settings stay staff-only when auth is on. */
export async function POST() {
  if (!isAuthEnabled()) {
    return NextResponse.json({ ok: true, guest: true, authRequired: false });
  }

  const token = await createSessionToken(GUEST_SESSION_EMAIL);
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_SEC * 1000);

  const cookieStore = await cookies();
  cookieStore.set(getSessionCookieName(), token, sessionCookieOptions(expiresAt));

  return NextResponse.json({ ok: true, email: GUEST_SESSION_EMAIL, guest: true });
}
