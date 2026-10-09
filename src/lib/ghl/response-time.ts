/**
 * Median minutes from the first inbound message to the first staff reply.
 * Message bodies are never kept.
 */
import { GhlApiError, ghlFetch } from "@/lib/ghl/http";
import type { GhlConfig } from "@/lib/ghl/types";

const PAGE_LIMIT = 500;
const MAX_PAGES = 6;

export type ResponseEvent = {
  conversationId: string;
  inbound: boolean;
  at: number;
};

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

function parseTime(raw: unknown): number | null {
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return raw > 1_000_000_000_000 ? raw : raw * 1000;
  }
  if (typeof raw !== "string" || !raw.trim()) return null;
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? ms : null;
}

/** Drop message text and keep only the timestamps needed for response time. */
export function slimResponseEvent(raw: unknown): ResponseEvent | null {
  const row = asRecord(raw);
  if (!row) return null;
  const conversationId =
    typeof row.conversationId === "string" ? row.conversationId : "";
  const direction = String(row.direction ?? "").toLowerCase();
  const at = parseTime(row.createdAt ?? row.dateAdded ?? row.dateAddedAt);
  if (!conversationId || !at) return null;
  if (direction !== "inbound" && direction !== "outbound") return null;
  const kind = String(row.messageType ?? row.type ?? "").toLowerCase();
  if (/activity|opportunity|invoice|payment|appointment|review/.test(kind)) {
    return null;
  }
  return { conversationId, inbound: direction === "inbound", at };
}

export function medianLeadResponseMinutes(events: ResponseEvent[]): number | null {
  const ordered = [...events].sort((a, b) => a.at - b.at);
  const byConversation = new Map<string, { firstIn?: number; firstOut?: number }>();
  for (const event of ordered) {
    const row = byConversation.get(event.conversationId) ?? {};
    if (event.inbound) {
      if (row.firstIn == null) row.firstIn = event.at;
    } else if (row.firstIn != null && row.firstOut == null && event.at >= row.firstIn) {
      row.firstOut = event.at;
    }
    byConversation.set(event.conversationId, row);
  }

  const minutes: number[] = [];
  for (const row of byConversation.values()) {
    if (row.firstIn == null || row.firstOut == null) continue;
    const delta = (row.firstOut - row.firstIn) / 60_000;
    if (delta >= 0 && delta < 60 * 24 * 14) minutes.push(delta);
  }
  if (minutes.length === 0) return null;
  minutes.sort((a, b) => a - b);
  const mid = Math.floor(minutes.length / 2);
  return minutes.length % 2 === 1
    ? minutes[mid]
    : (minutes[mid - 1] + minutes[mid]) / 2;
}

export function formatResponseMinutes(minutes: number): string {
  if (minutes < 1) return "< 1 min";
  if (minutes < 90) return `${Math.round(minutes)} min`;
  const hours = minutes / 60;
  if (hours < 48) return `${Math.round(hours * 10) / 10} hr`;
  return `${Math.round(hours / 24)} d`;
}

async function fetchMessagePage(
  config: GhlConfig,
  startYmd: string,
  endYmd: string,
  cursor: string | undefined,
  version: string,
): Promise<{ events: ResponseEvent[]; nextCursor: string | null }> {
  const params = new URLSearchParams({
    locationId: config.locationId,
    limit: String(PAGE_LIMIT),
    sortBy: "createdAt",
    sortOrder: "desc",
    startDate: startYmd,
    endDate: endYmd,
  });
  if (cursor) params.set("cursor", cursor);
  const data = await ghlFetch<{
    messages?: unknown[];
    nextCursor?: string | null;
  }>(
    `/conversations/messages/export?${params.toString()}`,
    { headers: { Version: version } },
    config,
  );
  const events = (data.messages ?? [])
    .map(slimResponseEvent)
    .filter((event): event is ResponseEvent => event != null);
  return { events, nextCursor: data.nextCursor ?? null };
}

/** Median first-reply time for the location. Null when conversations are unavailable. */
export async function loadMedianResponseMinutes(
  config: GhlConfig,
  startYmd: string,
  endYmd: string,
): Promise<number | null> {
  const events: ResponseEvent[] = [];
  let cursor: string | undefined;
  const versions = ["2021-07-28", "v3"];

  for (const version of versions) {
    events.length = 0;
    cursor = undefined;
    let failed = false;
    for (let page = 0; page < MAX_PAGES; page += 1) {
      try {
        const batch = await fetchMessagePage(
          config,
          startYmd,
          endYmd,
          cursor,
          version,
        );
        events.push(...batch.events);
        if (!batch.nextCursor) break;
        cursor = batch.nextCursor;
      } catch (e) {
        if (e instanceof GhlApiError && (e.status === 400 || e.status === 404 || e.status === 422)) {
          failed = true;
          break;
        }
        return null;
      }
    }
    if (!failed && events.length > 0) break;
  }

  return medianLeadResponseMinutes(events);
}
