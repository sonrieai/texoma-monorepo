/**
 * One-time: strip PHI fields from existing Atlas warehouse documents.
 * Take an Atlas snapshot first. Then: npm run purge:phi
 *
 * Patient docs: $unset firstName, lastName, email, raw.
 * Ledger docs: strip notes / PHI keys from stored `raw`.
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { closeMongoClient, COLLECTIONS, getCollection } from "../src/lib/mongo/client";
import {
  omitPhiKeys,
  PATIENT_PHI_UNSET_FIELDS,
  slimNexAdjustment,
  slimNexAppointment,
  slimNexCharge,
  slimNexClaim,
  slimNexGuarantorBalance,
  slimNexInsuranceBalance,
  slimNexInsurancePlan,
  slimNexPayment,
  slimNexProcedure,
  slimNexTreatmentPlan,
} from "../src/lib/mongo/phi-policy";
import { loadEnvLocal } from "../src/lib/mongo/sync";
import type {
  AdjustmentDoc,
  AppointmentDoc,
  ChargeDoc,
  ClaimDoc,
  GuarantorBalanceDoc,
  InsuranceBalanceDoc,
  InsurancePlanDoc,
  PaymentDoc,
  ProcedureDoc,
  TreatmentPlanDoc,
} from "../src/lib/mongo/types";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
loadEnvLocal(repoRoot);

async function purgePatients(): Promise<number> {
  const col = await getCollection(COLLECTIONS.patients);
  const result = await col.updateMany({}, { $unset: PATIENT_PHI_UNSET_FIELDS });
  return result.modifiedCount;
}

async function rewriteRaws<T extends { raw: Record<string, unknown> }>(
  collectionName: string,
  slim: (raw: T["raw"]) => T["raw"],
): Promise<number> {
  const col = await getCollection<T>(collectionName);
  const docs = await col.find({}).toArray();
  let count = 0;
  for (const doc of docs) {
    if (!doc.raw || typeof doc.raw !== "object") continue;
    const next = slim(omitPhiKeys(doc.raw as Record<string, unknown>) as T["raw"]);
    await col.updateOne({ _id: doc._id }, { $set: { raw: next } });
    count += 1;
  }
  return count;
}

async function main() {
  console.log(
    "Purging PHI from warehouse. Confirm an Atlas backup exists, then continue.",
  );

  const patients = await purgePatients();
  console.log(`patients $unset PHI fields: ${patients} modified`);

  const counts = {
    appointments: await rewriteRaws<AppointmentDoc>(
      COLLECTIONS.appointments,
      (r) => slimNexAppointment(r),
    ),
    procedures: await rewriteRaws<ProcedureDoc>(
      COLLECTIONS.procedures,
      (r) => slimNexProcedure(r),
    ),
    charges: await rewriteRaws<ChargeDoc>(COLLECTIONS.charges, (r) =>
      slimNexCharge(r),
    ),
    payments: await rewriteRaws<PaymentDoc>(COLLECTIONS.payments, (r) =>
      slimNexPayment(r),
    ),
    adjustments: await rewriteRaws<AdjustmentDoc>(
      COLLECTIONS.adjustments,
      (r) => slimNexAdjustment(r),
    ),
    treatment_plans: await rewriteRaws<TreatmentPlanDoc>(
      COLLECTIONS.treatmentPlans,
      (r) => slimNexTreatmentPlan(r),
    ),
    claims: await rewriteRaws<ClaimDoc>(COLLECTIONS.claims, (r) =>
      slimNexClaim(r),
    ),
    guarantor_balances: await rewriteRaws<GuarantorBalanceDoc>(
      COLLECTIONS.guarantorBalances,
      (r) => slimNexGuarantorBalance(r),
    ),
    insurance_balances: await rewriteRaws<InsuranceBalanceDoc>(
      COLLECTIONS.insuranceBalances,
      (r) => slimNexInsuranceBalance(r),
    ),
    insurance_plans: await rewriteRaws<InsurancePlanDoc>(
      COLLECTIONS.insurancePlans,
      (r) => slimNexInsurancePlan(r),
    ),
  };

  console.log("rewrote raw payloads:", counts);
  console.log("Done. Prefer npm run sync:nexhealth:full to backfill geo/carrier fields.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => closeMongoClient());
