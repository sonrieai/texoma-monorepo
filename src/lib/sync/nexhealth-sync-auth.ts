/** Shared auth for NexHealth warehouse sync HTTP triggers (manual, cron, Task Scheduler). */

export type SyncAuthResult =
  | { ok: true; via: "header" | "query" | "bearer" }
  | { ok: false; status: number; error: string };

function parseBearer(authorization: string | null): string {
  if (!authorization?.startsWith("Bearer ")) return "";
  return authorization.slice("Bearer ".length).trim();
}

function allowedSecrets(): Set<string> {
  const sync = process.env.SYNC_SECRET?.trim();
  const cron = process.env.CRON_SECRET?.trim();
  return new Set([sync, cron].filter((s): s is string => Boolean(s)));
}

export function authorizeNexHealthSyncRequest(request: Request): SyncAuthResult {
  const allowed = allowedSecrets();
  if (allowed.size === 0) {
    return {
      ok: false,
      status: 503,
      error: "SYNC_SECRET is not configured",
    };
  }

  const header = request.headers.get("x-sync-secret")?.trim() ?? "";
  if (header && allowed.has(header)) {
    return { ok: true, via: "header" };
  }

  const query = new URL(request.url).searchParams.get("secret")?.trim() ?? "";
  if (query && allowed.has(query)) {
    return { ok: true, via: "query" };
  }

  const bearer = parseBearer(request.headers.get("authorization"));
  if (bearer && allowed.has(bearer)) {
    return { ok: true, via: "bearer" };
  }

  return { ok: false, status: 401, error: "Unauthorized" };
}

export function isNexHealthSyncEnabled(): boolean {
  return process.env.SYNC_NEXHEALTH_ENABLED?.trim()?.toLowerCase() !== "false";
}

/** Cron schedule documented in vercel.json (UTC). */
export const NEXHEALTH_SYNC_CRON_SCHEDULE = "0 12 * * *";
