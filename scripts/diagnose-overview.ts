/**
 * Overview KPI diagnostic — Mongo counts + period field breakdown.
 * Usage: npx tsx scripts/diagnose-overview.ts [fromYmd] [toYmd]
 */
import { resolve } from "node:path";
import { MongoClient } from "mongodb";
import { createCdtLookupFromDocs } from "../src/lib/cdt/categories";
import { summarizeConversion } from "../src/lib/nexhealth/conversion";
import { summarizeProductionFromLedger } from "../src/lib/nexhealth/production";
import { nexPriceToCents } from "../src/lib/nexhealth/client";
import type { CdtCodeDoc } from "../src/lib/mongo/types";
import { loadEnvLocal } from "../src/lib/mongo/sync";

loadEnvLocal(resolve(process.cwd()));

const uri = process.env.MONGODB_URI ?? process.env.MONGODB_URL;
const dbName = process.env.MONGODB_DB ?? "open-dental-backup";
const locationId = Number(process.env.NEXHEALTH_LOCATION_ID || 0);
const fromYmd = process.argv[2] ?? "2026-08-01";
const toYmd = process.argv[3] ?? "2026-08-31";

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
  const counts = Object.fromEntries(
    await Promise.all(
      [
        "providers",
        "appointment_types",
        "appointments",
        "procedures",
        "charges",
        "payments",
        "adjustments",
        "treatment_plans",
        "guarantor_balances",
        "cdt_codes",
        "patients",
      ].map(async (name) => [name, await db.collection(name).countDocuments()]),
    ),
  );

  const charges = await db
    .collection("charges")
    .find({ locationId })
    .toArray();
  const payments = await db
    .collection("payments")
    .find({ locationId })
    .toArray();
  const procedures = await db
    .collection("procedures")
    .find({ locationId })
    .toArray();
  const appointments = await db
    .collection("appointments")
    .find({ locationId })
    .toArray();
  const treatmentPlans = await db
    .collection("treatment_plans")
    .find({ locationId })
    .toArray();
  const guarantorBalances = await db
    .collection("guarantor_balances")
    .find({ locationId })
    .toArray();
  const cdtDocs = (await db.collection("cdt_codes").find({}).toArray()) as CdtCodeDoc[];

  const chargeRaws = charges.map((c) => c.raw);
  const paymentRaws = payments.map((p) => p.raw);
  const procRaws = procedures.map((p) => p.raw);
  const apptRaws = appointments.map((a) => a.raw);
  const planRaws = treatmentPlans.map((t) => t.raw);
  const typeRaws = (
    await db.collection("appointment_types").find({ locationId }).toArray()
  ).map((t) => t.raw);

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

  const categorized = cdtDocs.filter(
    (d) => d.category && d.category !== "Uncategorized",
  ).length;
  const consultCodes = cdtDocs.filter((d) => d.isConsult).length;

  const chargesInRange = chargeRaws.filter((c) =>
    inRange(c.charged_at, fromYmd, toYmd),
  );
  const paymentsInRange = paymentRaws.filter((p) =>
    inRange(p.paid_at, fromYmd, toYmd),
  );
  const procsInRange = procRaws.filter((p) => {
    const d = p.start_date || p.end_date;
    return inRange(d, fromYmd, toYmd);
  });

  const chargeCodes = new Map<string, number>();
  for (const c of chargesInRange) {
    const code = String(c.procedure_code ?? "UNKNOWN");
    chargeCodes.set(code, (chargeCodes.get(code) ?? 0) + 1);
  }

  const unmappedChargeCodes: string[] = [];
  let mappedChargeCents = 0;
  let unmappedChargeCents = 0;
  for (const c of chargesInRange) {
    const cents = Math.round(Number.parseFloat(c.fee?.amount ?? "0") * 100);
    const cat = cdt.lookupCategory(c.procedure_code);
    if (cat) mappedChargeCents += cents;
    else {
      unmappedChargeCents += cents;
      const code = String(c.procedure_code ?? "UNKNOWN");
      if (!unmappedChargeCodes.includes(code)) unmappedChargeCodes.push(code);
    }
  }

  const production = summarizeProductionFromLedger({
    fromYmd,
    toYmd,
    procedures: procRaws,
    charges: chargeRaws,
    payments: paymentRaws,
    adjustments: [],
    cdt,
  });

  const conversion = summarizeConversion({
    fromYmd,
    toYmd,
    appointments: apptRaws,
    appointmentTypes: typeRaws,
    procedures: procRaws,
    plans: planRaws,
    cdt,
  });

  const ar = (() => {
    let totalArCents = 0;
    let arOver90Cents = 0;
    for (const g of guarantorBalances) {
      const row = g.raw;
      totalArCents += nexPriceToCents(row.total_balance);
      arOver90Cents += nexPriceToCents(row.total_balance_over_90);
    }
    return {
      totalArCents,
      arOver90Ratio: totalArCents > 0 ? arOver90Cents / totalArCents : null,
    };
  })();

  console.log(JSON.stringify(
    {
      env: {
        locationId,
        dbName,
        npConsultTypeIds: process.env.NEXHEALTH_NP_CONSULT_TYPE_IDS,
      },
      meta: {
        lastSyncedAt: meta?.lastSyncedAt,
        locationName: meta?.locationName,
      },
      mongoCounts: counts,
      cdt_codes: {
        total: cdtDocs.length,
        categorized,
        uncategorized: cdtDocs.length - categorized,
        isConsult: consultCodes,
      },
      period: { fromYmd, toYmd },
      inPeriod: {
        charges: chargesInRange.length,
        payments: paymentsInRange.length,
        procedures: procsInRange.length,
        appointments: apptRaws.filter((a) => inRange(a.start_time, fromYmd, toYmd))
          .length,
      },
      chargeDateRange: {
        min: chargeRaws.reduce(
          (m, c) => (c.charged_at && (!m || c.charged_at < m) ? c.charged_at : m),
          null as string | null,
        ),
        max: chargeRaws.reduce(
          (m, c) => (c.charged_at && (!m || c.charged_at > m) ? c.charged_at : m),
          null as string | null,
        ),
      },
      categoryMapping: {
        mappedChargeCents,
        unmappedChargeCents,
        unmappedChargeCodes: unmappedChargeCodes.slice(0, 20),
        topChargeCodes: [...chargeCodes.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 15)
          .map(([code, count]) => ({
            code,
            count,
            category: cdt.lookupCategory(code),
            volumeBucket: cdt.volumeBucket(code),
          })),
      },
      overviewKpis: {
        netProductionCents: production.netProductionCents,
        collectionRatio: production.collectionRatio,
        productionByCategory: production.productionByCategory,
        procedureVolume: production.procedureVolume,
        scProductionCents: production.paymentMix.soonercare,
        conversion: {
          newPatients: conversion.newPatients,
          npConsultShow: conversion.npConsultShow,
          npConsultShowRate: conversion.npConsultShowRate,
          sameDayStarts: conversion.sameDayStarts,
          tpClosedCents: conversion.tpClosedCents,
          notices: conversion.notices,
        },
        ar: {
          totalArCents: ar.totalArCents,
          arOver90Ratio: ar.arOver90Ratio,
        },
      },
      sampleCharge: chargesInRange[0] ?? chargeRaws[0] ?? null,
      samplePayment: paymentsInRange[0] ?? paymentRaws[0] ?? null,
    },
    null,
    2,
  ));

  await client.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
