import "server-only";

import { cookies } from "next/headers";
import { isAuthEnabled } from "@/lib/auth/config";
import { isGuestEmail } from "@/lib/auth/guest";
import { getSessionCookieName, verifySessionToken } from "@/lib/auth/session";

export type DashboardSession = {
  email: string;
  guest: boolean;
};

/** Logged-in session, including guest. */
export async function requireDashboardSession(): Promise<DashboardSession | null> {
  if (!isAuthEnabled()) {
    return { email: "dev@local", guest: false };
  }

  const cookieStore = await cookies();
  const token = cookieStore.get(getSessionCookieName())?.value;
  const session = await verifySessionToken(token);
  if (!session?.email) return null;
  return { email: session.email, guest: isGuestEmail(session.email) };
}

/** Staff session. Guest logins cannot change settings. */
export async function requireStaffSession(): Promise<DashboardSession | null> {
  const session = await requireDashboardSession();
  if (!session || session.guest) return null;
  return session;
}
