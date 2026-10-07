import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { isAuthEnabled } from "@/lib/auth/config";
import { isGuestEmail } from "@/lib/auth/guest";
import { SESSION_INACTIVITY_TIMEOUT_MS } from "@/lib/auth/session-constants";
import {
  getSessionCookieName,
  verifySessionToken,
} from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!isAuthEnabled()) {
    return NextResponse.json({ authenticated: false, enabled: false });
  }

  const cookieStore = await cookies();
  const token = cookieStore.get(getSessionCookieName())?.value;
  const session = await verifySessionToken(token);

  return NextResponse.json({
    authenticated: Boolean(session),
    enabled: true,
    email: session?.email ?? null,
    guest: isGuestEmail(session?.email),
    inactivityTimeoutMs: SESSION_INACTIVITY_TIMEOUT_MS,
    inactivityExpiresAt: session?.inactivityExpiresAt ?? null,
  });
}
