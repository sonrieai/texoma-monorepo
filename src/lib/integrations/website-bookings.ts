/**
 * Item 18 — attributed website bookings from smiletexoma.com (server-only fetch).
 * Credentials: WEBSITE_BOOKINGS_URL + WEBSITE_BOOKINGS_BEARER in env (never in repo).
 */

import "server-only";

export type WebsiteBookingRow = {
  date: string;
  slug: string;
  channel: string;
  last_touch: string;
  first_touch: string;
};

export type WebsiteFormLeadRow = {
  date: string;
  form: string;
  channel: string;
  last_touch: string;
  first_touch: string;
};

export async function fetchWebsiteBookingSources(): Promise<{
  ok: boolean;
  rows: WebsiteBookingRow[];
  stale: boolean;
  error?: string;
}> {
  const base = process.env.WEBSITE_BOOKINGS_URL?.trim();
  const token = process.env.WEBSITE_BOOKINGS_BEARER?.trim();
  if (!base || !token) {
    return {
      ok: false,
      rows: [],
      stale: false,
      error: "Website bookings API not configured",
    };
  }
  const url = base.includes("?")
    ? `${base}&format=json`
    : `${base.replace(/\/$/, "")}?format=json`;
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      next: { revalidate: 900 },
    });
    if (!res.ok) {
      return {
        ok: false,
        rows: [],
        stale: true,
        error: `HTTP ${res.status}`,
      };
    }
    const data = (await res.json()) as WebsiteBookingRow[];
    return { ok: true, rows: Array.isArray(data) ? data : [], stale: false };
  } catch (err) {
    return {
      ok: false,
      rows: [],
      stale: true,
      error: err instanceof Error ? err.message : "fetch failed",
    };
  }
}
