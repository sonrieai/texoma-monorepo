/**
 * PatNum ↔ GoHighLevel contact id cursor.
 * Names, phones, and emails are never written here.
 */

import { copyFile, mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  NO_SHOW_TAG_LIST,
  type NoShowTag,
} from "@/lib/ghl/od-disposition-tags";

export type OdGhlContactLink = {
  ghlContactId: string;
  noShowTag: NoShowTag | null;
};

export type OdGhlSyncState = {
  cursor: string | null;
  contacts: Record<string, OdGhlContactLink>;
};

function emptyState(): OdGhlSyncState {
  return { cursor: null, contacts: {} };
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
    contacts[patNum] = {
      ghlContactId: id.trim(),
      noShowTag: isNoShowTag(tag) ? tag : null,
    };
  }
  const cursor =
    typeof parsed.cursor === "string" && parsed.cursor.trim()
      ? parsed.cursor.trim()
      : null;
  return { cursor, contacts };
}

export async function readOdGhlSyncState(): Promise<OdGhlSyncState> {
  try {
    const raw = await readFile(getOdGhlSyncStatePath(), "utf8");
    return normalizeOdGhlSyncState(JSON.parse(raw) as unknown);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return emptyState();
    throw err;
  }
}

export async function writeOdGhlSyncState(state: OdGhlSyncState): Promise<void> {
  const filePath = getOdGhlSyncStatePath();
  await mkdir(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.tmp`;
  const body = `${JSON.stringify(normalizeOdGhlSyncState(state), null, 2)}\n`;
  await writeFile(tmp, body, "utf8");
  await copyFile(tmp, filePath);
  await unlink(tmp).catch(() => undefined);
}
