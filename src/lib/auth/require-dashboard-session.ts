import "server-only";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { accessForEmail, type DashboardAccess } from "@/lib/auth/access";
import { isAuthEnabled } from "@/lib/auth/config";
import type { NavProfile } from "@/lib/auth/nav-profile";
import { canAccess } from "@/lib/auth/roles";
import { getSessionCookieName, verifySessionToken } from "@/lib/auth/session";

export type DashboardSession = {
  email: string;
};

/** Logged-in user. Requires AUTH_SESSION_SECRET and a valid session. */
export async function getDashboardAccess(): Promise<DashboardAccess | null> {
  if (!isAuthEnabled()) return null;

  const cookieStore = await cookies();
  const token = cookieStore.get(getSessionCookieName())?.value;
  const session = await verifySessionToken(token);
  if (!session?.email) return null;
  return accessForEmail(session.email);
}

/** Logged-in session. */
export async function requireDashboardSession(): Promise<DashboardSession | null> {
  const access = await getDashboardAccess();
  if (!access) return null;
  return { email: access.email };
}

/** Owner or Office Manager. Other roles cannot change settings. */
export async function requireStaffSession(): Promise<DashboardSession | null> {
  const access = await getDashboardAccess();
  if (!access) return null;
  if (access.role !== "owner" && access.role !== "office_manager") return null;
  return { email: access.email };
}

/** API gate used by metric routes in addition to proxy. */
export async function apiAccessError(
  pathname: string,
): Promise<{ status: 401 | 403; error: string } | null> {
  if (!isAuthEnabled()) {
    return { status: 401, error: "Unauthorized" };
  }
  const access = await getDashboardAccess();
  if (!access) return { status: 401, error: "Unauthorized" };
  const allowed = access.role
    ? canAccess(access.role, pathname, access.providerId)
    : false;
  if (!allowed) return { status: 403, error: "Forbidden" };
  return null;
}

/** Page-level gate. Proxy redirects first; this covers the rendered shell too. */
export async function enforceCurrentPage(): Promise<void> {
  if (!isAuthEnabled()) return;

  const pathname = (await headers()).get("x-pathname");
  if (!pathname || pathname.startsWith("/login")) return;

  const access = await getDashboardAccess();
  if (!access) redirect("/login");

  const allowed = access.role
    ? canAccess(access.role, pathname, access.providerId)
    : false;
  if (!allowed) redirect(access.homePath);
}

/** Profile the sidebar can render on the server, before the client asks /api/auth/me. */
export async function loadNavProfile(): Promise<NavProfile> {
  if (!isAuthEnabled()) {
    return {
      enabled: false,
      authenticated: false,
      role: null,
      providerId: null,
    };
  }

  const access = await getDashboardAccess();
  if (!access) {
    return {
      enabled: true,
      authenticated: false,
      role: null,
      providerId: null,
    };
  }

  return {
    enabled: true,
    authenticated: true,
    role: access.role,
    providerId: access.providerId,
  };
}

export async function requireOwnerSession(): Promise<DashboardAccess | null> {
  const access = await getDashboardAccess();
  if (!access || access.role !== "owner") return null;
  return access;
}
