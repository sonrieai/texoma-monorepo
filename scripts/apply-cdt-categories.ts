/**
 * Re-apply Texoma Code Chart categories to Mongo + refresh OD code metadata.
 * Usage: npx tsx scripts/apply-cdt-categories.ts
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnvLocal } from "../src/lib/mongo/sync";
import { mergeCdtCategoriesFromJson } from "../src/lib/mongo/merge-cdt-categories";
import { closeMongoClient } from "../src/lib/mongo/client";
import { syncProcedureCodesFromNexHealth } from "../src/lib/mongo/sync-procedure-codes";
import { getCollection, COLLECTIONS } from "../src/lib/mongo/client";
import type { ProcedureDoc, ChargeDoc, TreatmentPlanDoc } from "../src/lib/mongo/types";
import { listProcedureCodeDescriptors } from "../src/lib/nexhealth/client";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
loadEnvLocal(repoRoot);

async function main() {
  const locationId = Number(process.env.NEXHEALTH_LOCATION_ID || 0);
  const merge = await mergeCdtCategoriesFromJson();
  console.log("Code chart merge:", merge);

  const [procedures, charges, treatmentPlans] = await Promise.all([
    getCollection<ProcedureDoc>(COLLECTIONS.procedures).then((c) =>
      c.find({ locationId }).toArray(),
    ),
    getCollection<ChargeDoc>(COLLECTIONS.charges).then((c) =>
      c.find({ locationId }).toArray(),
    ),
    getCollection<TreatmentPlanDoc>(COLLECTIONS.treatmentPlans).then((c) =>
      c.find({ locationId }).toArray(),
    ),
  ]);

  const resync = await syncProcedureCodesFromNexHealth({
    procedures: procedures.map((d) => d.raw),
    charges: charges.map((d) => d.raw),
    treatmentPlans: treatmentPlans.map((d) => d.raw),
    appointmentDescriptors: await listProcedureCodeDescriptors(),
  });
  console.log("Procedure code resync:", resync);

  await closeMongoClient();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
