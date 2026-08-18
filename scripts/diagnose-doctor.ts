/**
 * Doctor page KPI diagnostic — per-provider breakdown vs UI.
 * Usage: npx tsx scripts/diagnose-doctor.ts [fromYmd] [toYmd]
 */
import { resolve } from "node:path";
import { MongoClient } from "mongodb";
import { createCdtLookupFromDocs } from "../src/lib/cdt/categories";
import {
  buildConsultProcedureDays,
  isConsultAppointment,
  mapConversionAttendance,
  perProviderSameDayNp,
  resolveNpConsultTypeIds,
} from "../src/lib/nexhealth/conversion";
import { summarizeProductionFromLedger } from "../src/lib/nexhealth/production";
import { loadEnvLocal } from "../src/lib/mongo/sync";
import type { CdtCodeDoc } from "../src/lib/mongo/types";

loadEnvLocal(resolve(process.cwd()));

const uri = process.env.MONGODB_URI ?? process.env.MONGODB_URL;
const dbName = process.env.MONGODB_DB ?? "open-dental-backup";
const locationId = Number(process.env.NEXHEALTH_LOCATION_ID || 0);
const fromYmd = process.argv[2] ?? "2026-01-01";
const toYmd = process.argv[3] ?? "2026-08-17";

function inRange(date: string | null | undefined, from: string, to: string): boolean {
  if (!date) return false;
  const d = date.slice(0, 10);
  return d >= from && d <= to;
}

async function main() {
  if (!uri) {
    console.error("MONGODB_URI missing");
    process.exit(1);
  }

  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(dbName);

  const meta = await db.collection("meta").findOne({ _id: "overview" });
  const providers = await db.collection("providers").find({ locationId }).toArray();
  const appointments = await db
    .collection("appointments")
    .find({ locationId })
    .toArray();
  const procedures = await db.collection("procedures").find({ locationId }).toArray();
  const charges = await db.collection("charges").find({ locationId }).toArray();
  const payments = await db.collection("payments").find({ locationId }).toArray();
  const adjustments = await db.collection("adjustments").find({ locationId }).toArray();
  const appointmentTypes = await db
    .collection("appointment_types")
    .find({ locationId })
    .toArray();
  const cdtDocs = (await db.collection("cdt_codes").find({}).toArray()) as CdtCodeDoc[];

  const apptRawsAll = appointments.map((a) => a.raw);
  const apptRaws = apptRawsAll.filter((a) => inRange(a.start_time, fromYmd, toYmd));
  const procRaws = procedures.map((p) => p.raw);
  const typeRaws = appointmentTypes.map((t) => t.raw);

  const cdt = createCdtLookupFromDocs(
    cdtDocs.map((d) => ({
      code: d.code,
      category: d.category,
      description: d.description,
      volumeBucket: d.volumeBucket,
      warrantyBucket: d.warrantyBucket,
      isAox: d.isAox,
      isSoldCase: d.isSoldCase,
      isConsult: d.isConsult,
    })),
  );

  const production = summarizeProductionFromLedger({
    fromYmd,
    toYmd,
    procedures: procRaws,
    charges: charges.map((c) => c.raw),
    payments: payments.map((p) => p.raw),
    adjustments: adjustments.map((a) => a.raw),
    cdt,
  });

  const { ids: npConsultTypeIds } = resolveNpConsultTypeIds(typeRaws);
  const npConsultTypeSet = new Set(npConsultTypeIds);
  const consultProcedureDays = buildConsultProcedureDays(procRaws, cdt);

  const npByProvider = new Map<number, number>();
  for (const p of providers.filter((x) => !x.inactive)) {
    npByProvider.set(p.nexhealthId, 0);
  }

  for (const appt of apptRaws) {
    if (
      !isConsultAppointment(appt, npConsultTypeSet, consultProcedureDays) ||
      mapConversionAttendance(appt) !== "show"
    ) {
      continue;
    }
    const pid = appt.provider_id;
    if (pid == null) continue;
    npByProvider.set(pid, (npByProvider.get(pid) ?? 0) + 1);
  }

  const sameDayByProvider = perProviderSameDayNp({
    fromYmd,
    toYmd,
    appointments: apptRawsAll,
    procedures: procRaws,
    appointmentTypes: typeRaws,
    cdt,
  });

  const providerNames = new Map<number, string>();
  for (const p of providers) {
    providerNames.set(p.nexhealthId, p.name);
  }

  type Row = {
    name: string;
    prodCents: number;
    vol: (typeof production)["procedureVolume"];
    np: number;
    sameDay: number;
  };

  const rows: Row[] = [];
  const seen = new Set<number>();

  for (const [pid, prod] of production.byProvider) {
    seen.add(pid);
    rows.push({
      name: providerNames.get(pid) ?? `Provider ${pid}`,
      prodCents: prod.grossProductionCents,
      vol: prod.procedureVolume,
      np: npByProvider.get(pid) ?? 0,
      sameDay: sameDayByProvider.get(pid) ?? 0,
    });
  }
  for (const [pid, np] of npByProvider) {
    if (seen.has(pid)) continue;
    if (np === 0) continue;
    rows.push({
      name: providerNames.get(pid) ?? `Provider ${pid}`,
      prodCents: 0,
      vol: {
        extractions: 0,
        implants: 0,
        aox: 0,
        dentures: 0,
        partials: 0,
        remakes: 0,
      },
      np,
      sameDay: sameDayByProvider.get(pid) ?? 0,
    });
  }

  rows.sort((a, b) => b.prodCents - a.prodCents);

  const sumVol = (key: keyof Row["vol"]) =>
    rows.reduce((s, r) => s + r.vol[key], 0);
  const totalNp = rows.reduce((s, r) => s + r.np, 0);
  const totalSameDay = rows.reduce((s, r) => s + r.sameDay, 0);

  console.log("=== Doctor page diagnostic ===");
  console.log(`Period: ${fromYmd} → ${toYmd}`);
  console.log(`Location: ${meta?.locationName ?? locationId}`);
  console.log(`Last synced: ${meta?.lastSyncedAt ?? "never"}`);
  console.log(`NP consult type IDs: ${npConsultTypeIds.join(", ") || "(none — using consult CDT codes)"}`);
  console.log("");
  console.log("Top KPIs (/doctor cards):");
  console.log(`  Implants placed:     ${sumVol("implants")}`);
  console.log(`  Full-arch cases:     ${sumVol("aox")}`);
  console.log(`  New patients seen:   ${totalNp}`);
  console.log(
    `  Same-day NP conv:    ${totalNp > 0 ? `${Math.round((100 * totalSameDay) / totalNp)}%` : "—"} (${totalSameDay}/${totalNp})`,
  );
  console.log(`  Denture remakes:     ${sumVol("remakes")}`);
  console.log("");
  console.log("By provider (table + charts):");
  for (const r of rows) {
    const perPatient =
      r.np > 0 ? `$${(r.prodCents / 100 / r.np).toFixed(0)}` : "—";
    console.log(
      `  ${r.name.padEnd(18)} prod=$${(r.prodCents / 100).toFixed(0).padStart(4)}  impl=${r.vol.implants}  arch=${r.vol.aox}  dent=${r.vol.dentures}  np=${r.np}  sameDay=${r.sameDay}  $/pt=${perPatient}`,
    );
  }

  await client.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
