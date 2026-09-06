import {
  COLLECTIONS,
  getCollection,
  getDb,
  type CollectionName,
  type SyncHistoryDoc,
  type SyncTrigger,
} from "@/lib/mongo/client";
import { getWarehouseMeta } from "@/lib/mongo/warehouse-overview";
import { getNexHealthConfig } from "@/lib/nexhealth/client";
import { pageCount } from "@/lib/ui/pagination";

export const SYNC_HISTORY_WINDOW_DAYS = 30;
export const SYNC_HISTORY_PAGE_SIZE = 10;

/** Literal fallback avoids stale hot-reload where COLLECTIONS.syncHistory is missing. */
const SYNC_HISTORY_COLLECTION: CollectionName =
  COLLECTIONS.syncHistory ?? "sync_history";

export type SyncHistoryRow = {
  id: string;
  startedAt: string;
  finishedAt: string;
  ok: boolean;
  trigger: SyncTrigger;
  triggeredBy: string | null;
  nexhealthRequestCount: number;
  upsertTotal: number;
  durationMs: number;
  errorSummary: string | null;
};

export type SyncHistoryPage = {
  items: SyncHistoryRow[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  windowDays: number;
};

function historySinceIso(): string {
  const ms = SYNC_HISTORY_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  return new Date(Date.now() - ms).toISOString();
}

function sumUpserts(upserts: Record<string, number>): number {
  return Object.values(upserts).reduce((sum, n) => sum + n, 0);
}

function docToRow(doc: SyncHistoryDoc & { _id?: unknown }): SyncHistoryRow {
  const started = new Date(doc.startedAt).getTime();
  const finished = new Date(doc.finishedAt).getTime();
  const durationMs =
    Number.isFinite(started) && Number.isFinite(finished)
      ? Math.max(0, finished - started)
      : 0;

  return {
    id: String(doc._id),
    startedAt: doc.startedAt,
    finishedAt: doc.finishedAt,
    ok: doc.ok,
    trigger: doc.trigger,
    triggeredBy: doc.triggeredBy ?? null,
    nexhealthRequestCount: doc.nexhealthRequestCount,
    upsertTotal: doc.upsertTotal,
    durationMs,
    errorSummary: doc.errorSummary ?? null,
  };
}

async function resolveLocationId(): Promise<number> {
  const meta = await getWarehouseMeta();
  if (meta?.locationId) return meta.locationId;
  const config = getNexHealthConfig();
  if (config?.locationId) return config.locationId;
  return Number(process.env.NEXHEALTH_LOCATION_ID || 0);
}

async function syncHistoryCollectionExists(): Promise<boolean> {
  const db = await getDb();
  return db
    .listCollections({ name: SYNC_HISTORY_COLLECTION }, { nameOnly: true })
    .hasNext();
}

function emptyHistoryPage(
  page: number,
  pageSize: number,
): SyncHistoryPage {
  return {
    items: [],
    page,
    pageSize,
    total: 0,
    totalPages: 0,
    windowDays: SYNC_HISTORY_WINDOW_DAYS,
  };
}

export async function recordSyncHistory(params: {
  startedAt: string;
  finishedAt: string;
  ok: boolean;
  trigger: SyncTrigger;
  triggeredBy?: string | null;
  locationId: number;
  subdomain: string;
  nexhealthRequestCount: number;
  upserts?: Record<string, number>;
  errors?: string[];
}): Promise<void> {
  const col = await getCollection<SyncHistoryDoc>(SYNC_HISTORY_COLLECTION);
  const upsertTotal = sumUpserts(params.upserts ?? {});
  const errorSummary =
    params.errors?.length ? params.errors.slice(0, 3).join("; ") : null;

  await col.insertOne({
    locationId: params.locationId,
    subdomain: params.subdomain,
    startedAt: params.startedAt,
    finishedAt: params.finishedAt,
    ok: params.ok,
    trigger: params.trigger,
    triggeredBy: params.triggeredBy ?? null,
    nexhealthRequestCount: params.nexhealthRequestCount,
    upsertTotal,
    errorSummary,
  });
}

export async function listSyncHistory(params: {
  page?: number;
  pageSize?: number;
}): Promise<SyncHistoryPage> {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(
    50,
    Math.max(1, params.pageSize ?? SYNC_HISTORY_PAGE_SIZE),
  );
  const locationId = await resolveLocationId();
  const since = historySinceIso();

  try {
    if (!(await syncHistoryCollectionExists())) {
      return emptyHistoryPage(page, pageSize);
    }

    const col = await getCollection<SyncHistoryDoc>(SYNC_HISTORY_COLLECTION);
    const filter = { locationId, finishedAt: { $gte: since } };
    const skip = (page - 1) * pageSize;

    const [docs, total] = await Promise.all([
      col
        .find(filter)
        .sort({ finishedAt: -1 })
        .skip(skip)
        .limit(pageSize)
        .toArray(),
      col.countDocuments(filter).catch(() => 0),
    ]);

    return {
      items: docs.map(docToRow),
      page,
      pageSize,
      total,
      totalPages: pageCount(total, pageSize),
      windowDays: SYNC_HISTORY_WINDOW_DAYS,
    };
  } catch {
    return emptyHistoryPage(page, pageSize);
  }
}
