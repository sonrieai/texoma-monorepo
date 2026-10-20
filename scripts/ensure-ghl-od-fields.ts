/**
 * Create Open Dental sync custom fields on the Texoma GHL location if missing.
 */
import { loadEnvLocal } from "../src/lib/env/load-env-local";

loadEnvLocal();

const NEEDED = [
  { name: "od_patnum", dataType: "TEXT", placeholder: "Open Dental PatNum" },
  { name: "od_aptnum", dataType: "TEXT", placeholder: "Open Dental AptNum" },
  { name: "od_last_sync", dataType: "DATE", placeholder: "Last OD→GHL sync" },
  {
    name: "od_consult_date",
    dataType: "DATE",
    placeholder: "Next OD consult (Central)",
  },
  {
    name: "od_missed_appt_date",
    dataType: "DATE",
    placeholder: "OD no-show/cancel date",
  },
  {
    name: "od_next_appt_date",
    dataType: "DATE",
    placeholder: "Next OD appt after miss",
  },
] as const;

const CUSTOM_VALUES = [
  {
    name: "od_sync_last_success",
    value: "",
  },
] as const;

async function main() {
  const key = process.env.GHL_API_KEY?.trim();
  const loc = process.env.GHL_LOCATION_ID?.trim();
  if (!key || !loc) throw new Error("GHL_API_KEY and GHL_LOCATION_ID required");
  const headers = {
    Authorization: `Bearer ${key}`,
    Version: "2021-07-28",
    Accept: "application/json",
    "Content-Type": "application/json",
  };
  const listRes = await fetch(
    `https://services.leadconnectorhq.com/locations/${encodeURIComponent(loc)}/customFields?model=contact`,
    { headers },
  );
  if (!listRes.ok) throw new Error(`list fields ${listRes.status}: ${await listRes.text()}`);
  const listJson = (await listRes.json()) as {
    customFields?: Array<{ id: string; name: string; fieldKey?: string }>;
  };
  const existing = listJson.customFields ?? [];
  const byName = new Map(existing.map((f) => [f.name.toLowerCase(), f]));
  const created: Array<{ name: string; id: string }> = [];
  for (const field of NEEDED) {
    const hit = byName.get(field.name.toLowerCase());
    if (hit) {
      console.log(`exists ${field.name} ${hit.id} key=${hit.fieldKey ?? ""}`);
      continue;
    }
    const res = await fetch(
      `https://services.leadconnectorhq.com/locations/${encodeURIComponent(loc)}/customFields`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          name: field.name,
          dataType: field.dataType,
          placeholder: field.placeholder,
          model: "contact",
        }),
      },
    );
    const text = await res.text();
    if (!res.ok) throw new Error(`create ${field.name} ${res.status}: ${text}`);
    const json = JSON.parse(text) as { customField?: { id?: string }; id?: string };
    const id = json.customField?.id ?? json.id;
    if (!id) throw new Error(`create ${field.name} missing id: ${text}`);
    created.push({ name: field.name, id });
    console.log(`created ${field.name} ${id}`);
  }
  const active = existing.find((f) => f.name === "Active Sequence");

  const cvListRes = await fetch(
    `https://services.leadconnectorhq.com/locations/${encodeURIComponent(loc)}/customValues`,
    { headers },
  );
  if (!cvListRes.ok) {
    throw new Error(`list custom values ${cvListRes.status}: ${await cvListRes.text()}`);
  }
  const cvJson = (await cvListRes.json()) as {
    customValues?: Array<{ id: string; name: string }>;
  };
  const cvExisting = cvJson.customValues ?? [];
  const cvByName = new Map(cvExisting.map((v) => [v.name.toLowerCase(), v]));
  const createdValues: Array<{ name: string; id: string }> = [];
  for (const cv of CUSTOM_VALUES) {
    const hit = cvByName.get(cv.name.toLowerCase());
    if (hit) {
      console.log(`exists value ${cv.name} ${hit.id}`);
      continue;
    }
    const res = await fetch(
      `https://services.leadconnectorhq.com/locations/${encodeURIComponent(loc)}/customValues`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({ name: cv.name, value: cv.value }),
      },
    );
    const text = await res.text();
    if (!res.ok) throw new Error(`create value ${cv.name} ${res.status}: ${text}`);
    const json = JSON.parse(text) as { customValue?: { id?: string }; id?: string };
    const id = json.customValue?.id ?? json.id;
    if (!id) throw new Error(`create value ${cv.name} missing id: ${text}`);
    createdValues.push({ name: cv.name, id });
    console.log(`created value ${cv.name} ${id}`);
  }

  console.log(
    JSON.stringify(
      {
        activeSequenceId: active?.id ?? null,
        created,
        createdValues,
        envHints: {
          GHL_OD_CONSULT_DATE_FIELD_ID: "od_consult_date id",
          GHL_OD_MISSED_APPT_DATE_FIELD_ID: "od_missed_appt_date id",
          GHL_OD_NEXT_APPT_DATE_FIELD_ID: "od_next_appt_date id",
          GHL_OD_SYNC_LAST_SUCCESS_VALUE_ID: "od_sync_last_success value id",
          GHL_TC_PIPELINE_ID: "Treatment Coordinator pipeline",
        },
        hintCalendar: "2CC6dQCfjWGcMnxYndE8 Front Desk",
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
