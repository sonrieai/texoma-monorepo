/**
 * PatNum ↔ GoHighLevel contact id cursor.
 * Names, phones, and emails are never written here.
 */

import { copyFile, mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { COLLECTIONS, getDb, isMongoConfigured } from "@/lib/mongo/client";
import {
  NEW_PATIENT_TAG_LIST,
  NO_SHOW_TAG_LIST,
  type NewPatientTag,
  type NoShowTag,
} from "@/lib/ghl/od-disposition-tags";

export type OdGhlAppointmentLink = {
  ghlEventId: string;
};

export type OdGhlContactLink = {
  ghlContactId: string;
  noShowTag: NoShowTag | null;
  /** Present after this app has sent new-patient tags for the contact. */
  newPatientTags?: NewPatientTag[];
  /** AptNum → GHL calendar event id. */
  appointments?: Record<string, OdGhlAppointmentLink>;
  /** Last known has_future_appt from middleware. */
  hasFutureAppt?: boolean;
  /** Last Active Sequence value written by this sync. */
  activeSequence?: string | null;
};

export const OD_GHL_SYNC_MODES = [
  "consults",
  "patients",
  "appointments",
  "sold",
] as const;

export type OdGhlSyncMode = (typeof OD_GHL_SYNC_MODES)[number];
export type OdGhlSyncRunMode = OdGhlSyncMode | "all";

export type OdGhlSyncCursors = {
  consults: string | null;
  patients: string | null;
  appointments: string | null;
  sold: string | null;
};

export type OdGhlSyncState = {
  /** Legacy single cursor — kept as an alias of `cursors.consults`. */
  cursor: string | null;
  /** Independent watermarks so the 5-minute consult job cannot skip nightly work. */
  cursors: OdGhlSyncCursors;
  contacts: Record<string, OdGhlContactLink>;
  /** ISO timestamp of last run with failed === 0. */
  lastSuccessfulRunAt?: string | null;
};

function emptyCursors(): OdGhlSyncCursors {
  return {
    consults: null,
    patients: null,
    appointments: null,
    sold: null,
  };
}

export function hydrateModeCursors(
  raw: Partial<OdGhlSyncCursors> | null | undefined,
  legacyCursor: string | null,
): OdGhlSyncCursors {
  const source = raw && typeof raw === "object" ? raw : {};
  const pick = (value: unknown): string | null =>
    typeof value === "string" && value.trim() ? value.trim() : null;
  return {
    consults: pick(source.consults) ?? legacyCursor,
    patients: pick(source.patients) ?? legacyCursor,
    appointments: pick(source.appointments) ?? legacyCursor,
    sold: pick(source.sold) ?? legacyCursor,
  };
}

export function parseOdGhlSyncMode(
  raw: string | null | undefined,
): OdGhlSyncMode | "all" | null {
  const value = (raw ?? "").trim().toLowerCase();
  if (!value) return null;
  if (value === "all") return "all";
  if ((OD_GHL_SYNC_MODES as readonly string[]).includes(value)) {
    return value as OdGhlSyncMode;
  }
  return null;
}

type SyncStateDoc = OdGhlSyncState & { _id: "state" };

function emptyState(): OdGhlSyncState {
  return {
    cursor: null,
    cursors: emptyCursors(),
    contacts: {},
    lastSuccessfulRunAt: null,
  };
}

export function getOdGhlSyncStatePath(): string {
  const override = process.env.OD_GHL_SYNC_STATE_PATH?.trim();
  if (override) return override;
  return path.join(process.cwd(), "data", "od-ghl-sync.json");
}

function isNoShowTag(value: unknown): value is NoShowTag {
  return (
    typeof value === "string" &&
    (NO_SHOW_TAG_LIST as readonly string[]).includes(value)
  );
}

function isNewPatientTag(value: unknown): value is NewPatientTag {
  return (
    typeof value === "string" &&
    (NEW_PATIENT_TAG_LIST as readonly string[]).includes(value)
  );
}

function normalizeAppointments(
  raw: unknown,
): Record<string, OdGhlAppointmentLink> | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const out: Record<string, OdGhlAppointmentLink> = {};
  for (const [aptNum, link] of Object.entries(raw)) {
    if (!/^\d+$/.test(aptNum)) continue;
    if (!link || typeof link !== "object") continue;
    const id = (link as OdGhlAppointmentLink).ghlEventId;
    if (typeof id !== "string" || !id.trim()) continue;
    out[aptNum] = { ghlEventId: id.trim() };
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

export function normalizeOdGhlSyncState(raw: unknown): OdGhlSyncState {
  const parsed =
    raw && typeof raw === "object" ? (raw as Partial<OdGhlSyncState>) : {};
  const contacts: Record<string, OdGhlContactLink> = {};
  const source =
    parsed.contacts && typeof parsed.contacts === "object" ? parsed.contacts : {};
  for (const [patNum, link] of Object.entries(source)) {
    if (!/^\d+$/.test(patNum)) continue;
    if (!link || typeof link !== "object") continue;
    const id = (link as OdGhlContactLink).ghlContactId;
    if (typeof id !== "string" || !id.trim()) continue;
    const tag = (link as OdGhlContactLink).noShowTag;
    const rawTags = (link as OdGhlContactLink).newPatientTags;
    const newPatientTags = Array.isArray(rawTags)
      ? rawTags.filter(isNewPatientTag)
      : undefined;
    const appointments = normalizeAppointments(
      (link as OdGhlContactLink).appointments,
    );
    const hasFutureAppt = (link as OdGhlContactLink).hasFutureAppt;
    const activeSequence = (link as OdGhlContactLink).activeSequence;
    contacts[patNum] = {
      ghlContactId: id.trim(),
      noShowTag: isNoShowTag(tag) ? tag : null,
      ...(newPatientTags ? { newPatientTags } : {}),
      ...(appointments ? { appointments } : {}),
      ...(typeof hasFutureAppt === "boolean" ? { hasFutureAppt } : {}),
      ...(typeof activeSequence === "string" || activeSequence === null
        ? { activeSequence }
        : {}),
    };
  }
  const legacyCursor =
    typeof parsed.cursor === "string" && parsed.cursor.trim()
      ? parsed.cursor.trim()
      : null;
  const cursors = hydrateModeCursors(parsed.cursors, legacyCursor);
  const lastSuccessfulRunAt =
    typeof parsed.lastSuccessfulRunAt === "string" &&
    parsed.lastSuccessfulRunAt.trim()
      ? parsed.lastSuccessfulRunAt.trim()
      : null;
  return {
    cursor: cursors.consults,
    cursors,
    contacts,
    lastSuccessfulRunAt,
  };
}

function usesMongoSyncState(): boolean {
  if (process.env.OD_GHL_SYNC_STATE_PATH?.trim()) return false;
  return isMongoConfigured();
}

export async function readOdGhlSyncState(): Promise<OdGhlSyncState> {
  if (usesMongoSyncState()) {
    const db = await getDb();
    const doc = await db
      .collection<SyncStateDoc>(COLLECTIONS.odGhlSyncState)
      .findOne({ _id: "state" });
    return normalizeOdGhlSyncState(doc);
  }
  try {
    const raw = await readFile(getOdGhlSyncStatePath(), "utf8");
    return normalizeOdGhlSyncState(JSON.parse(raw) as unknown);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return emptyState();
    throw err;
  }
}

export async function writeOdGhlSyncState(state: OdGhlSyncState): Promise<void> {
  const normalized = normalizeOdGhlSyncState(state);
  if (usesMongoSyncState()) {
    const db = await getDb();
    await db.collection<SyncStateDoc>(COLLECTIONS.odGhlSyncState).replaceOne(
      { _id: "state" },
      normalized,
      { upsert: true },
    );
    return;
  }
  const filePath = getOdGhlSyncStatePath();
  await mkdir(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.tmp`;
  const body = `${JSON.stringify(normalized, null, 2)}\n`;
  await writeFile(tmp, body, "utf8");
  await copyFile(tmp, filePath);
  await unlink(tmp).catch(() => undefined);
}
