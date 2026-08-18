import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { isAuthEnabled } from "@/lib/auth/config";
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
  });
}
