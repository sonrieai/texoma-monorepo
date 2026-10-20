/**
 * Cross-check Texoma OD → GHL sync: env, cursor, sample linked contact in GHL.
 */
import { loadEnvLocal } from "../src/lib/env/load-env-local";
import { TEXOMA_GHL_LOCATION_ID } from "../src/lib/ghl/config";
import { readOdGhlSyncState } from "../src/lib/ghl/od-ghl-sync-state";

loadEnvLocal();

async function main() {
  const locationId = process.env.GHL_LOCATION_ID?.trim();
  const key = process.env.GHL_API_KEY?.trim();
  const calendarId = process.env.GHL_CALENDAR_ID?.trim();
  const state = await readOdGhlSyncState();
  const contactEntries = Object.entries(state.contacts);
  const sample = contactEntries[0];

  const report: Record<string, unknown> = {
    locationOk: locationId === TEXOMA_GHL_LOCATION_ID,
    locationId,
    expectedLocation: TEXOMA_GHL_LOCATION_ID,
    hasApiKey: Boolean(key),
    calendarId: calendarId ?? null,
    cursor: state.cursor,
    linkedContacts: contactEntries.length,
    fieldIds: {
      patnum: process.env.GHL_OD_PATNUM_FIELD_ID ?? null,
      aptnum: process.env.GHL_OD_APTNUM_FIELD_ID ?? null,
      lastSync: process.env.GHL_OD_LAST_SYNC_FIELD_ID ?? null,
      activeSequence: process.env.GHL_ACTIVE_SEQUENCE_FIELD_ID ?? null,
    },
  };

  if (sample && key && locationId) {
    const [patNum, link] = sample;
    const res = await fetch(
      `https://services.leadconnectorhq.com/contacts/${encodeURIComponent(link.ghlContactId)}`,
      {
        headers: {
          Authorization: `Bearer ${key}`,
          Version: "2021-07-28",
          Accept: "application/json",
        },
      },
    );
    const text = await res.text();
    let source: string | null = null;
    let tags: string[] = [];
    if (res.ok) {
      const json = JSON.parse(text) as {
        contact?: { source?: string; tags?: string[]; locationId?: string };
      };
      source = json.contact?.source ?? null;
      tags = json.contact?.tags ?? [];
      report.sampleContact = {
        patNum,
        ghlContactId: link.ghlContactId,
        httpStatus: res.status,
        locationId: json.contact?.locationId ?? null,
        source,
        tags: tags.filter((t) =>
          /NEW PATIENT|NO SHOWED|od-appt/i.test(t),
        ),
      };
    } else {
      report.sampleContact = {
        patNum,
        ghlContactId: link.ghlContactId,
        httpStatus: res.status,
        error: text.slice(0, 200),
      };
    }
  }

  console.log(JSON.stringify(report, null, 2));
  if (locationId !== TEXOMA_GHL_LOCATION_ID) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
