/**
 * End-to-end OD → Texoma GHL cases from the integration spec.
 * Mutates Open Dental with SYNCTEST_* rows, runs sync, asserts GHL.
 *
 * Prefer a restored OD copy (writes fail on SELECT-only live tomorrow):
 *   set OD_GHL_E2E_MYSQL_HOST / PORT / USER / PASS / DB in .env.local
 *
 * Usage:
 *   npx tsx --env-file=.env.local --require ./scripts/register-server-only-stub.cjs scripts/e2e-od-ghl-sync-cases.ts
 *   ... -- --keep   (leave OD fixtures; default cleans appointments + marks patients inactive)
 */
import { loadEnvLocal } from "../src/lib/env/load-env-local";
import { ACTIVE_SEQUENCE, OD_APPT_BOOKED_TAG } from "../src/lib/ghl/contacts";
import {
  NEW_PATIENT_TAG,
  NEW_PATIENT_TAGS,
  NO_SHOW_TAGS,
} from "../src/lib/ghl/od-disposition-tags";
import { TEXOMA_GHL_LOCATION_ID } from "../src/lib/ghl/config";
import { readOdGhlSyncState } from "../src/lib/ghl/od-ghl-sync-state";
import { runOdGhlSync } from "../src/lib/ghl/sync-from-opendental";
import {
  closeOpenDentalMysql,
  executeOpenDental,
  queryOpenDental,
} from "../src/lib/opendental/mysql";
import { OdAptStatus } from "../src/lib/opendental/types";
import type { RowDataPacket } from "mysql2";

loadEnvLocal();

/** Point OD writes at a restore DB when OD_GHL_E2E_MYSQL_* is set. */
function applyE2eMysqlOverride(): void {
  const host = process.env.OD_GHL_E2E_MYSQL_HOST?.trim();
  if (!host) {
    console.warn(
      "OD_GHL_E2E_MYSQL_HOST unset — e2e writes to OD_MYSQL_* (use a restore copy once SELECT-only is live).",
    );
    return;
  }
  process.env.OD_MYSQL_HOST = host;
  if (process.env.OD_GHL_E2E_MYSQL_PORT?.trim()) {
    process.env.OD_MYSQL_PORT = process.env.OD_GHL_E2E_MYSQL_PORT.trim();
  }
  if (process.env.OD_GHL_E2E_MYSQL_USER?.trim()) {
    process.env.OD_MYSQL_USER = process.env.OD_GHL_E2E_MYSQL_USER.trim();
  }
  if (process.env.OD_GHL_E2E_MYSQL_PASS?.trim()) {
    process.env.OD_MYSQL_PASS = process.env.OD_GHL_E2E_MYSQL_PASS.trim();
  }
  if (process.env.OD_GHL_E2E_MYSQL_DB?.trim()) {
    process.env.OD_MYSQL_DB = process.env.OD_GHL_E2E_MYSQL_DB.trim();
  }
  console.log(
    `E2E OD MySQL override → ${process.env.OD_MYSQL_USER}@${process.env.OD_MYSQL_HOST}/${process.env.OD_MYSQL_DB}`,
  );
}

applyE2eMysqlOverride();

const KEEP = process.argv.includes("--keep");
const TEMPLATE_PATNUM = 14675;
const TEMPLATE_APTNUM = 84126;
const RUN_ID = new Date()
  .toISOString()
  .replace(/[-:TZ.]/g, "")
  .slice(0, 14);

type CaseResult = {
  id: string;
  title: string;
  ok: boolean;
  detail: string;
  patNum?: number;
  ghlContactId?: string;
};

type GhlContactView = {
  id: string;
  source: string | null;
  tags: string[];
  locationId: string | null;
  custom: Record<string, string>;
  appointments: Array<{ id: string; status: string | null; startTime: string | null }>;
  smsDnd: boolean;
};

const results: CaseResult[] = [];
const createdPatNums: number[] = [];
const createdAptNums: number[] = [];
const tempDefNums: number[] = [];

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}

/** GHL stores tags lowercased. */
function hasTag(tags: readonly string[], expected: string): boolean {
  const want = expected.trim().toLowerCase();
  return tags.some((t) => t.trim().toLowerCase() === want);
}

async function ghlHeaders(): Promise<HeadersInit> {
  const key = process.env.GHL_API_KEY?.trim();
  assert(key, "GHL_API_KEY required");
  assert(
    process.env.GHL_LOCATION_ID?.trim() === TEXOMA_GHL_LOCATION_ID,
    `GHL_LOCATION_ID must be Texoma ${TEXOMA_GHL_LOCATION_ID}`,
  );
  return {
    Authorization: `Bearer ${key}`,
    Version: "2021-07-28",
    Accept: "application/json",
  };
}

async function fetchGhlContact(contactId: string): Promise<GhlContactView> {
  const headers = await ghlHeaders();
  const res = await fetch(
    `https://services.leadconnectorhq.com/contacts/${encodeURIComponent(contactId)}`,
    { headers },
  );
  const text = await res.text();
  assert(res.ok, `GET contact ${contactId} → ${res.status} ${text.slice(0, 200)}`);
  const json = JSON.parse(text) as {
    contact?: {
      id?: string;
      source?: string;
      tags?: string[];
      locationId?: string;
      customFields?: Array<{ id?: string; key?: string; fieldKey?: string; value?: unknown }>;
    };
  };
  const c = json.contact;
  assert(c?.id, "contact missing id");
  const custom: Record<string, string> = {};
  const idToKey: Record<string, string> = {
    [process.env.GHL_OD_PATNUM_FIELD_ID ?? ""]: "od_patnum",
    [process.env.GHL_OD_APTNUM_FIELD_ID ?? ""]: "od_aptnum",
    [process.env.GHL_OD_LAST_SYNC_FIELD_ID ?? ""]: "od_last_sync",
    [process.env.GHL_OD_CONSULT_DATE_FIELD_ID ?? ""]: "od_consult_date",
    [process.env.GHL_OD_MISSED_APPT_DATE_FIELD_ID ?? ""]: "od_missed_appt_date",
    [process.env.GHL_OD_NEXT_APPT_DATE_FIELD_ID ?? ""]: "od_next_appt_date",
    [process.env.GHL_ACTIVE_SEQUENCE_FIELD_ID ?? ""]: "active_sequence",
  };
  for (const field of c.customFields ?? []) {
    const id = field.id ?? "";
    const key =
      idToKey[id] ||
      (field.fieldKey ?? field.key ?? "").replace(/^contact\./, "");
    if (!key) continue;
    custom[key] = String(field.value ?? "");
  }
  const apptRes = await fetch(
    `https://services.leadconnectorhq.com/contacts/${encodeURIComponent(contactId)}/appointments`,
    { headers },
  );
  const apptText = await apptRes.text();
  let appointments: GhlContactView["appointments"] = [];
  if (apptRes.ok) {
    const apptJson = JSON.parse(apptText) as {
      events?: Array<{ id?: string; appointmentStatus?: string; startTime?: string }>;
      appointments?: Array<{ id?: string; appointmentStatus?: string; startTime?: string }>;
    };
    const list = apptJson.events ?? apptJson.appointments ?? [];
    appointments = list.map((row) => ({
      id: String(row.id ?? ""),
      status: row.appointmentStatus ?? null,
      startTime: row.startTime ?? null,
    }));
  }
  return {
    id: c.id,
    source: c.source ?? null,
    tags: c.tags ?? [],
    locationId: c.locationId ?? null,
    custom,
    appointments,
    smsDnd: (() => {
      const raw = json.contact as {
        dnd?: boolean;
        dndSettings?: { SMS?: { status?: string } };
      };
      const sms = raw?.dndSettings?.SMS?.status?.toLowerCase();
      if (sms === "active") return true;
      if (sms === "inactive") return false;
      return raw?.dnd === true;
    })(),
  };
}

async function clonePatient(label: string): Promise<{
  patNum: number;
  email: string;
  phone: string;
  chart: string;
}> {
  const chart = `SYNCTEST-${RUN_ID}-${label}`;
  const email = `sync.${label}.${RUN_ID}@example.com`.toLowerCase();
  const phone = `58055${String(Date.now()).slice(-6)}`.slice(0, 10);
  const fname = `Case${label}`;
  const lname = "SyncTest";

  const cols = await queryOpenDental<RowDataPacket>(
    `SELECT COLUMN_NAME AS name
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'patient'
       AND EXTRA NOT LIKE '%auto_increment%'
     ORDER BY ORDINAL_POSITION`,
  );
  const names = cols.map((c) => String(c.name));
  const selectList = names
    .map((name) => {
      if (name === "LName") return `? AS LName`;
      if (name === "FName") return `? AS FName`;
      if (name === "WirelessPhone") return `? AS WirelessPhone`;
      if (name === "HmPhone") return `'' AS HmPhone`;
      if (name === "Email") return `? AS Email`;
      if (name === "ChartNumber") return `? AS ChartNumber`;
      if (name === "Guarantor") return `0 AS Guarantor`;
      if (name === "ResponsParty") return `0 AS ResponsParty`;
      if (name === "SuperFamily") return `0 AS SuperFamily`;
      if (name === "AddrNote") return `NULL AS AddrNote`;
      if (name === "FamFinUrgNote") return `NULL AS FamFinUrgNote`;
      if (name === "PatStatus") return `0 AS PatStatus`;
      return `\`${name}\``;
    })
    .join(", ");

  await executeOpenDental(
    `INSERT INTO patient (${names.map((n) => `\`${n}\``).join(", ")})
     SELECT ${selectList} FROM patient WHERE PatNum = ? LIMIT 1`,
    [lname, fname, phone, email, chart, TEMPLATE_PATNUM],
  );
  const rows = await queryOpenDental<RowDataPacket>(
    `SELECT PatNum FROM patient WHERE ChartNumber = ? LIMIT 1`,
    [chart],
  );
  const patNum = Number(rows[0]?.PatNum);
  assert(patNum > 0, `failed to create patient ${chart}`);
  await executeOpenDental(`UPDATE patient SET Guarantor = ? WHERE PatNum = ?`, [
    patNum,
    patNum,
  ]);
  createdPatNums.push(patNum);
  return { patNum, email, phone, chart };
}

async function cloneAppointment(params: {
  patNum: number;
  aptDateTime: string;
  aptStatus: number;
  confirmed: number;
  appointmentTypeNum?: number;
  pattern?: string;
}): Promise<number> {
  const cols = await queryOpenDental<RowDataPacket>(
    `SELECT COLUMN_NAME AS name
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'appointment'
       AND EXTRA NOT LIKE '%auto_increment%'
     ORDER BY ORDINAL_POSITION`,
  );
  const names = cols.map((c) => String(c.name));
  const selectList = names
    .map((name) => {
      if (name === "PatNum") return `? AS PatNum`;
      if (name === "Note") return `'SYNCTEST e2e ${RUN_ID}' AS Note`;
      if (name === "IsNewPatient") return `1 AS IsNewPatient`;
      if (name === "ProcDescript") return `NULL AS ProcDescript`;
      if (name === "ProcsColored") return `'' AS ProcsColored`;
      return `\`${name}\``;
    })
    .join(", ");

  await executeOpenDental(
    `INSERT INTO appointment (${names.map((n) => `\`${n}\``).join(", ")})
     SELECT ${selectList} FROM appointment WHERE AptNum = ? LIMIT 1`,
    [params.patNum, TEMPLATE_APTNUM],
  );
  const rows = await queryOpenDental<RowDataPacket>(
    `SELECT AptNum FROM appointment
     WHERE PatNum = ? AND Note LIKE ?
     ORDER BY AptNum DESC LIMIT 1`,
    [params.patNum, `SYNCTEST e2e ${RUN_ID}%`],
  );
  const aptNum = Number(rows[0]?.AptNum);
  assert(aptNum > 0, "failed to create appointment");
  createdAptNums.push(aptNum);

  await executeOpenDental(
    `UPDATE appointment
     SET AptStatus = ?,
         Confirmed = ?,
         AptDateTime = ?,
         AppointmentTypeNum = COALESCE(?, AppointmentTypeNum),
         Pattern = COALESCE(?, Pattern)
     WHERE AptNum = ?`,
    [
      params.aptStatus,
      params.confirmed,
      params.aptDateTime,
      params.appointmentTypeNum ?? null,
      params.pattern ?? null,
      aptNum,
    ],
  );
  return aptNum;
}

async function attachAoxConsultProc(aptNum: number, patNum: number): Promise<void> {
  const codes = await queryOpenDental<RowDataPacket>(
    `SELECT CodeNum FROM procedurecode WHERE ProcCode = 'N9310 AOX Cons' LIMIT 1`,
  );
  const codeNum = Number(codes[0]?.CodeNum);
  assert(codeNum > 0, "missing procedurecode N9310 AOX Cons");
  const template = await queryOpenDental<RowDataPacket>(
    `SELECT ProvNum, ClinicNum FROM appointment WHERE AptNum = ? LIMIT 1`,
    [aptNum],
  );
  const prov = Number(template[0]?.ProvNum ?? 1);
  const clinic = Number(template[0]?.ClinicNum ?? 0);
  // Minimal procedurelog row via cloning an existing completed row shape if present
  const sample = await queryOpenDental<RowDataPacket>(
    `SELECT ProcNum FROM procedurelog WHERE AptNum > 0 ORDER BY ProcNum DESC LIMIT 1`,
  );
  assert(sample[0]?.ProcNum, "no procedurelog template");
  const cols = await queryOpenDental<RowDataPacket>(
    `SELECT COLUMN_NAME AS name
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'procedurelog'
       AND EXTRA NOT LIKE '%auto_increment%'
     ORDER BY ORDINAL_POSITION`,
  );
  const names = cols.map((c) => String(c.name));
  const selectList = names
    .map((name) => {
      if (name === "PatNum") return `? AS PatNum`;
      if (name === "AptNum") return `? AS AptNum`;
      if (name === "CodeNum") return `? AS CodeNum`;
      if (name === "ProvNum") return `? AS ProvNum`;
      if (name === "ClinicNum") return `? AS ClinicNum`;
      if (name === "ProcStatus") return `1 AS ProcStatus`; // TP
      if (name === "ProcDate") return `CURDATE() AS ProcDate`;
      if (name === "DateComplete") return `'0001-01-01' AS DateComplete`;
      return `\`${name}\``;
    })
    .join(", ");
  await executeOpenDental(
    `INSERT INTO procedurelog (${names.map((n) => `\`${n}\``).join(", ")})
     SELECT ${selectList} FROM procedurelog WHERE ProcNum = ? LIMIT 1`,
    [patNum, aptNum, codeNum, prov, clinic, Number(sample[0].ProcNum)],
  );
}

async function ensureAoxConsultType(): Promise<number> {
  const name = "N9310 AOX Consult";
  const existing = await queryOpenDental<RowDataPacket>(
    `SELECT AppointmentTypeNum FROM appointmenttype WHERE AppointmentTypeName = ? LIMIT 1`,
    [name],
  );
  if (existing[0]?.AppointmentTypeNum) {
    return Number(existing[0].AppointmentTypeNum);
  }
  const cols = await queryOpenDental<RowDataPacket>(
    `SELECT COLUMN_NAME AS name
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'appointmenttype'
       AND EXTRA NOT LIKE '%auto_increment%'
     ORDER BY ORDINAL_POSITION`,
  );
  const sample = await queryOpenDental<RowDataPacket>(
    `SELECT AppointmentTypeNum FROM appointmenttype ORDER BY AppointmentTypeNum LIMIT 1`,
  );
  assert(sample[0]?.AppointmentTypeNum, "no appointmenttype template");
  const names = cols.map((c) => String(c.name));
  const selectList = names
    .map((col) => {
      if (col === "AppointmentTypeName") return `? AS AppointmentTypeName`;
      return `\`${col}\``;
    })
    .join(", ");
  await executeOpenDental(
    `INSERT INTO appointmenttype (${names.map((n) => `\`${n}\``).join(", ")})
     SELECT ${selectList} FROM appointmenttype WHERE AppointmentTypeNum = ? LIMIT 1`,
    [name, Number(sample[0].AppointmentTypeNum)],
  );
  const created = await queryOpenDental<RowDataPacket>(
    `SELECT AppointmentTypeNum FROM appointmenttype WHERE AppointmentTypeName = ? LIMIT 1`,
    [name],
  );
  const id = Number(created[0]?.AppointmentTypeNum);
  assert(id > 0, "failed to create N9310 AOX Consult type");
  return id;
}

async function ensureConfirmDef(itemName: string): Promise<number> {
  const existing = await queryOpenDental<RowDataPacket>(
    `SELECT DefNum FROM definition WHERE Category = 2 AND ItemName = ? LIMIT 1`,
    [itemName],
  );
  if (existing[0]?.DefNum) return Number(existing[0].DefNum);

  const maxOrder = await queryOpenDental<RowDataPacket>(
    `SELECT COALESCE(MAX(ItemOrder), 0) + 1 AS nextOrder FROM definition WHERE Category = 2`,
  );
  await executeOpenDental(
    `INSERT INTO definition (Category, ItemOrder, ItemName, ItemValue, ItemColor, IsHidden)
     VALUES (2, ?, ?, '', 0, 0)`,
    [Number(maxOrder[0]?.nextOrder ?? 99), itemName],
  );
  const created = await queryOpenDental<RowDataPacket>(
    `SELECT DefNum FROM definition WHERE Category = 2 AND ItemName = ? LIMIT 1`,
    [itemName],
  );
  const defNum = Number(created[0]?.DefNum);
  assert(defNum > 0, `failed to create definition ${itemName}`);
  tempDefNums.push(defNum);
  return defNum;
}

async function syncNow(): Promise<void> {
  const result = await runOdGhlSync();
  assert(
    result.failed === 0,
    `sync failed count=${result.failed} (patients=${result.patients} upserted=${result.upserted} appts=${result.appointmentsWritten})`,
  );
}

async function sleep(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

async function ghlLink(patNum: number): Promise<string> {
  const state = await readOdGhlSyncState();
  const id = state.contacts[String(patNum)]?.ghlContactId;
  assert(id, `no GHL link for PatNum ${patNum}`);
  return id;
}

function futureStamp(daysAhead: number, hour = 10): string {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(hour)}:00:00`;
}

function pastStamp(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} 10:00:00`;
}

async function runCase(
  id: string,
  title: string,
  fn: () => Promise<{ detail: string; patNum?: number; ghlContactId?: string }>,
): Promise<void> {
  try {
    const out = await fn();
    results.push({ id, title, ok: true, ...out });
    console.log(`PASS ${id} ${title} — ${out.detail}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    results.push({ id, title, ok: false, detail: message });
    console.error(`FAIL ${id} ${title} — ${message}`);
  }
}

async function cleanup(): Promise<void> {
  if (KEEP) {
    console.log("Keeping fixtures (--keep). PatNums:", createdPatNums.join(", "));
    return;
  }
  for (const aptNum of createdAptNums) {
    await executeOpenDental(`DELETE FROM procedurelog WHERE AptNum = ?`, [aptNum]).catch(
      () => undefined,
    );
    await executeOpenDental(`DELETE FROM appointment WHERE AptNum = ?`, [aptNum]).catch(
      () => undefined,
    );
  }
  for (const patNum of createdPatNums) {
    // Soft-hide: inactive status 2 (Archived) common in OD; avoid hard delete of patients
    await executeOpenDental(`UPDATE patient SET PatStatus = 2 WHERE PatNum = ?`, [
      patNum,
    ]).catch(() => undefined);
  }
  for (const defNum of tempDefNums) {
    await executeOpenDental(`DELETE FROM definition WHERE DefNum = ?`, [defNum]).catch(
      () => undefined,
    );
  }
}

async function main() {
  assert(
    process.env.GHL_LOCATION_ID?.trim() === TEXOMA_GHL_LOCATION_ID,
    "Texoma location only",
  );
  assert(process.env.GHL_CALENDAR_ID?.trim(), "GHL_CALENDAR_ID required");

  const noShowDef = await ensureConfirmDef("69 AOX NO SHOW - AOX No-Showed");
  const reschedDef = await ensureConfirmDef("68 AOX RESCH - AOX Rescheduled by Patient");
  const aoxTypeNum = await ensureAoxConsultType();
  const unconfirmed = await queryOpenDental<RowDataPacket>(
    `SELECT DefNum FROM definition WHERE Category = 2 AND ItemName = 'Unconfirmed' LIMIT 1`,
  );
  const unconfirmedDef = Number(unconfirmed[0]?.DefNum ?? 19);

  // --- A: unbooked new patient → New Inquiries ---
  await runCase("A", "Unbooked patient → New Inquiries + NEW PATIENT", async () => {
    const p = await clonePatient("A");
    await syncNow();
    const contactId = await ghlLink(p.patNum);
    await sleep(800);
    const ghl = await fetchGhlContact(contactId);
    assert(ghl.locationId === TEXOMA_GHL_LOCATION_ID, `wrong location ${ghl.locationId}`);
    assert(ghl.source === "Open Dental", `source=${ghl.source}`);
    assert(
      hasTag(ghl.tags, NEW_PATIENT_TAG),
      `missing ${NEW_PATIENT_TAG}; tags=${ghl.tags.join(",")}`,
    );
    assert(!hasTag(ghl.tags, OD_APPT_BOOKED_TAG), "should not have od-appt-booked");
    assert(
      ghl.custom.active_sequence === ACTIVE_SEQUENCE.newInquiries ||
        ghl.custom.active_sequence === "New Inquiries",
      `Active Sequence=${ghl.custom.active_sequence}`,
    );
    assert(
      ghl.custom.od_patnum === String(p.patNum) ||
        ghl.custom.od_pat_num === String(p.patNum),
      `od_patnum=${ghl.custom.od_patnum}`,
    );
    return { detail: `PatNum ${p.patNum} → ${contactId}`, patNum: p.patNum, ghlContactId: contactId };
  });

  // --- B: future appt at first sync → booked path ---
  await runCase("B", "Future appt on create → od-appt-booked + Sequence None + GHL appt", async () => {
    const p = await clonePatient("B");
    const aptNum = await cloneAppointment({
      patNum: p.patNum,
      aptDateTime: futureStamp(14),
      aptStatus: OdAptStatus.Scheduled,
      confirmed: unconfirmedDef,
      appointmentTypeNum: aoxTypeNum,
    });
    await executeOpenDental(
      `UPDATE appointment SET AppointmentTypeNum = ? WHERE AptNum = ?`,
      [aoxTypeNum, aptNum],
    );
    await attachAoxConsultProc(aptNum, p.patNum);
    const verify = await queryOpenDental<RowDataPacket>(
      `SELECT atype.AppointmentTypeName AS name
       FROM appointment a
       LEFT JOIN appointmenttype atype ON atype.AppointmentTypeNum = a.AppointmentTypeNum
       WHERE a.AptNum = ? LIMIT 1`,
      [aptNum],
    );
    assert(
      String(verify[0]?.name ?? "").includes("N9310 AOX"),
      `apt type not AOX consult: ${verify[0]?.name}`,
    );
    await syncNow();
    const contactId = await ghlLink(p.patNum);
    await sleep(800);
    const ghl = await fetchGhlContact(contactId);
    assert(hasTag(ghl.tags, OD_APPT_BOOKED_TAG), "missing od-appt-booked");
    assert(
      ghl.custom.active_sequence === ACTIVE_SEQUENCE.none ||
        ghl.custom.active_sequence === "None",
      `Active Sequence=${ghl.custom.active_sequence}`,
    );
    assert(hasTag(ghl.tags, NEW_PATIENT_TAG), "missing NEW PATIENT");
    assert(
      hasTag(ghl.tags, NEW_PATIENT_TAGS.aox),
      `missing ${NEW_PATIENT_TAGS.aox}; tags=${ghl.tags.join(",")}`,
    );
    assert(ghl.appointments.length >= 1, "expected GHL calendar appointment");
    assert(
      ghl.appointments.some((a) => a.status === "confirmed"),
      `expected confirmed appt; got ${JSON.stringify(ghl.appointments)}`,
    );
    assert(
      Boolean(ghl.custom.od_consult_date?.trim()),
      `expected od_consult_date; got ${ghl.custom.od_consult_date}`,
    );
    return {
      detail: `PatNum ${p.patNum} AptNum ${aptNum} appts=${ghl.appointments.length} consult=${ghl.custom.od_consult_date}`,
      patNum: p.patNum,
      ghlContactId: contactId,
    };
  });

  // --- C: Case B timing — book after first sync ---
  await runCase("C", "Book after first sync → flips to od-appt-booked / None", async () => {
    const p = await clonePatient("C");
    await syncNow();
    let contactId = await ghlLink(p.patNum);
    let ghl = await fetchGhlContact(contactId);
    assert(
      ghl.custom.active_sequence === ACTIVE_SEQUENCE.newInquiries ||
        ghl.custom.active_sequence === "New Inquiries",
      `before book Sequence=${ghl.custom.active_sequence}`,
    );
    assert(!hasTag(ghl.tags, OD_APPT_BOOKED_TAG), "should not be booked yet");

    const aptNum = await cloneAppointment({
      patNum: p.patNum,
      aptDateTime: futureStamp(21),
      aptStatus: OdAptStatus.Scheduled,
      confirmed: unconfirmedDef,
    });
    await syncNow();
    contactId = await ghlLink(p.patNum);
    await sleep(800);
    ghl = await fetchGhlContact(contactId);
    assert(hasTag(ghl.tags, OD_APPT_BOOKED_TAG), "missing od-appt-booked after book");
    assert(
      ghl.custom.active_sequence === ACTIVE_SEQUENCE.none ||
        ghl.custom.active_sequence === "None",
      `after book Sequence=${ghl.custom.active_sequence}`,
    );
    assert(ghl.appointments.length >= 1, "expected GHL appointment after book");
    return {
      detail: `PatNum ${p.patNum} AptNum ${aptNum}`,
      patNum: p.patNum,
      ghlContactId: contactId,
    };
  });

  // --- D: no-show confirm → NO SHOWED AOX ---
  await runCase("D", "69 AOX confirm → NO SHOWED AOX tag", async () => {
    const p = await clonePatient("D");
    const aptNum = await cloneAppointment({
      patNum: p.patNum,
      aptDateTime: pastStamp(1),
      aptStatus: OdAptStatus.Scheduled,
      confirmed: unconfirmedDef,
    });
    await attachAoxConsultProc(aptNum, p.patNum);
    await syncNow();
    await executeOpenDental(`UPDATE appointment SET Confirmed = ? WHERE AptNum = ?`, [
      noShowDef,
      aptNum,
    ]);
    await syncNow();
    const contactId = await ghlLink(p.patNum);
    await sleep(800);
    const ghl = await fetchGhlContact(contactId);
    assert(
      hasTag(ghl.tags, NO_SHOW_TAGS.aox),
      `missing ${NO_SHOW_TAGS.aox}; tags=${ghl.tags.join(",")}`,
    );
    return { detail: `PatNum ${p.patNum}`, patNum: p.patNum, ghlContactId: contactId };
  });

  // --- E: reschedule after no-show → clear no-show tag ---
  await runCase("E", "68 AOX after no-show → clears NO SHOWED AOX", async () => {
    const p = await clonePatient("E");
    const aptNum = await cloneAppointment({
      patNum: p.patNum,
      aptDateTime: pastStamp(2),
      aptStatus: OdAptStatus.Scheduled,
      confirmed: unconfirmedDef,
      appointmentTypeNum: aoxTypeNum,
    });
    await attachAoxConsultProc(aptNum, p.patNum);
    await syncNow();
    await executeOpenDental(`UPDATE appointment SET Confirmed = ? WHERE AptNum = ?`, [
      noShowDef,
      aptNum,
    ]);
    await syncNow();
    let contactId = await ghlLink(p.patNum);
    await sleep(800);
    let ghl = await fetchGhlContact(contactId);
    assert(
      hasTag(ghl.tags, NO_SHOW_TAGS.aox),
      `setup: expected no-show tag; tags=${ghl.tags.join(",")}`,
    );

    await executeOpenDental(`UPDATE appointment SET Confirmed = ? WHERE AptNum = ?`, [
      reschedDef,
      aptNum,
    ]);
    await syncNow();
    contactId = await ghlLink(p.patNum);
    await sleep(800);
    ghl = await fetchGhlContact(contactId);
    assert(
      !hasTag(ghl.tags, NO_SHOW_TAGS.aox),
      `no-show tag still present; tags=${ghl.tags.join(",")}`,
    );
    return { detail: `PatNum ${p.patNum}`, patNum: p.patNum, ghlContactId: contactId };
  });

  // --- F: Complete → GHL showed ---
  await runCase("F", "AptStatus Complete → GHL appointmentStatus showed", async () => {
    const p = await clonePatient("F");
    const aptNum = await cloneAppointment({
      patNum: p.patNum,
      aptDateTime: futureStamp(30),
      aptStatus: OdAptStatus.Scheduled,
      confirmed: unconfirmedDef,
    });
    await syncNow();
    await executeOpenDental(
      `UPDATE appointment SET AptStatus = ?, AptDateTime = ? WHERE AptNum = ?`,
      [OdAptStatus.Complete, pastStamp(0), aptNum],
    );
    await syncNow();
    const contactId = await ghlLink(p.patNum);
    await sleep(800);
    const ghl = await fetchGhlContact(contactId);
    assert(
      ghl.appointments.some((a) => a.status === "showed"),
      `expected showed; got ${JSON.stringify(ghl.appointments)}`,
    );
    return { detail: `PatNum ${p.patNum}`, patNum: p.patNum, ghlContactId: contactId };
  });

  // --- G: Broken → GHL noshow ---
  await runCase("G", "AptStatus Broken → GHL appointmentStatus noshow", async () => {
    const p = await clonePatient("G");
    const aptNum = await cloneAppointment({
      patNum: p.patNum,
      aptDateTime: futureStamp(35),
      aptStatus: OdAptStatus.Scheduled,
      confirmed: unconfirmedDef,
    });
    await syncNow();
    await executeOpenDental(`UPDATE appointment SET AptStatus = ? WHERE AptNum = ?`, [
      OdAptStatus.Broken,
      aptNum,
    ]);
    await syncNow();
    const contactId = await ghlLink(p.patNum);
    await sleep(800);
    const ghl = await fetchGhlContact(contactId);
    assert(
      ghl.appointments.some((a) => a.status === "noshow"),
      `expected noshow; got ${JSON.stringify(ghl.appointments)}`,
    );
    return { detail: `PatNum ${p.patNum}`, patNum: p.patNum, ghlContactId: contactId };
  });

  // --- H: existing unbooked contact must not reset to New Inquiries ---
  await runCase("H", "Existing unbooked contact does not reset New Inquiries", async () => {
    const p = await clonePatient("H");
    await syncNow();
    const contactId = await ghlLink(p.patNum);
    await sleep(500);
    let ghl = await fetchGhlContact(contactId);
    assert(
      ghl.custom.active_sequence === ACTIVE_SEQUENCE.newInquiries ||
        ghl.custom.active_sequence === "New Inquiries",
      `setup Sequence=${ghl.custom.active_sequence}`,
    );
    const headers = await ghlHeaders();
    const fieldId = process.env.GHL_ACTIVE_SEQUENCE_FIELD_ID?.trim();
    const putRes = await fetch(
      `https://services.leadconnectorhq.com/contacts/${encodeURIComponent(contactId)}`,
      {
        method: "PUT",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          customFields: [
            fieldId
              ? { id: fieldId, field_value: ACTIVE_SEQUENCE.none }
              : { key: "active_sequence", field_value: ACTIVE_SEQUENCE.none },
          ],
        }),
      },
    );
    assert(putRes.ok, `force Sequence None failed ${putRes.status}`);
    await executeOpenDental(`UPDATE patient SET DateTStamp = NOW() WHERE PatNum = ?`, [
      p.patNum,
    ]);
    await syncNow();
    await sleep(800);
    ghl = await fetchGhlContact(contactId);
    assert(
      ghl.custom.active_sequence === ACTIVE_SEQUENCE.none ||
        ghl.custom.active_sequence === "None",
      `re-sync must leave Sequence alone; got ${ghl.custom.active_sequence}`,
    );
    return { detail: `PatNum ${p.patNum} stayed None`, patNum: p.patNum, ghlContactId: contactId };
  });

  // --- I: TxtMsgOk No → SMS DND ---
  await runCase("I", "TxtMsgOk No → SMS DND", async () => {
    const p = await clonePatient("I");
    await executeOpenDental(`UPDATE patient SET TxtMsgOk = 2, DateTStamp = NOW() WHERE PatNum = ?`, [
      p.patNum,
    ]);
    await syncNow();
    const contactId = await ghlLink(p.patNum);
    await sleep(800);
    const ghl = await fetchGhlContact(contactId);
    assert(ghl.smsDnd === true, `expected SMS DND; smsDnd=${ghl.smsDnd}`);
    return { detail: `PatNum ${p.patNum} SMS DND`, patNum: p.patNum, ghlContactId: contactId };
  });

  await cleanup();

  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;
  console.log("\n=== OD → GHL E2E SUMMARY ===");
  console.log(JSON.stringify({ runId: RUN_ID, passed, failed, results }, null, 2));
  if (failed > 0) process.exitCode = 1;
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await cleanup().catch(() => undefined);
    await closeOpenDentalMysql();
  });
