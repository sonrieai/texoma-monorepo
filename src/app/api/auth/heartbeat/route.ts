import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { isAuthEnabled } from "@/lib/auth/config";
import {
  SESSION_HEARTBEAT_DEBOUNCE_MS,
  SESSION_INACTIVITY_TIMEOUT_MS,
} from "@/lib/auth/session-constants";
import {
  getSessionCookieName,
  readSessionPayloadFromToken,
  refreshSessionToken,
  sessionCookieOptions,
  verifySessionToken,
} from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export async function POST() {
  if (!isAuthEnabled()) {
    return NextResponse.json({ ok: false, error: "Auth disabled" }, { status: 503 });
  }

  const cookieStore = await cookies();
  const token = cookieStore.get(getSessionCookieName())?.value;
  const payload = await readSessionPayloadFromToken(token);

  if (!payload) {
    return NextResponse.json({ ok: false, error: "Session expired" }, { status: 401 });
  }

  const refreshedToken = await refreshSessionToken(payload.sub, payload.exp);
  const expiresAt = new Date(payload.exp * 1000);
  cookieStore.set(
    getSessionCookieName(),
    refreshedToken,
    sessionCookieOptions(expiresAt),
  );

  const session = await verifySessionToken(refreshedToken);
  return NextResponse.json({
    ok: true,
    inactivityTimeoutMs: SESSION_INACTIVITY_TIMEOUT_MS,
    heartbeatDebounceMs: SESSION_HEARTBEAT_DEBOUNCE_MS,
    inactivityExpiresAt: session?.inactivityExpiresAt ?? null,
  });
}
