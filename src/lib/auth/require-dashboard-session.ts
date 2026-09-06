import "server-only";

import { cookies } from "next/headers";
import { isAuthEnabled } from "@/lib/auth/config";
import { getSessionCookieName, verifySessionToken } from "@/lib/auth/session";

export type DashboardSession = {
  email: string;
};

/** Settings / admin routes — requires login when auth is enabled. */
export async function requireDashboardSession(): Promise<DashboardSession | null> {
  if (!isAuthEnabled()) {
    return { email: "dev@local" };
  }

  const cookieStore = await cookies();
  const token = cookieStore.get(getSessionCookieName())?.value;
  const session = await verifySessionToken(token);
  if (!session?.email) return null;
  return { email: session.email };
}
