import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnvLocal } from "../src/lib/mongo/sync";
import { closeMongoClient, COLLECTIONS, getCollection } from "../src/lib/mongo/client";
import {
  listAppointmentDescriptors,
  listProcedureCodeDescriptors,
} from "../src/lib/nexhealth/client";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
loadEnvLocal(repoRoot);

async function main() {
  const all = await listAppointmentDescriptors({ maxPages: 10, perPage: 1000 });
  const types = new Map<string, number>();
  for (const r of all) {
    const t = r.descriptor_type ?? "unknown";
    types.set(t, (types.get(t) ?? 0) + 1);
  }
  console.log("descriptor types:", Object.fromEntries(types));

  const nonProc = all.filter((r) => r.descriptor_type !== "Procedure Codes");
  console.log(
    "non-procedure samples:",
    JSON.stringify(nonProc.slice(0, 15), null, 2),
  );

  const rows = await listProcedureCodeDescriptors();
  const withData = rows.filter(
    (r) => r.data && typeof r.data === "object" && Object.keys(r.data).length > 0,
  );
  console.log("descriptors:", rows.length, "with data:", withData.length);
  for (const code of ["D7140", "D6010", "D5110", "T1356", "D0120"]) {
    const row = rows.find((r) => r.code === code);
    console.log("\n", code, JSON.stringify(row, null, 2));
  }
  if (withData[0]) {
    console.log("\nfirst with data:", JSON.stringify(withData[0], null, 2));
  }

  const col = await getCollection(COLLECTIONS.cdtCodes);
  const cats = await col
    .aggregate<{ _id: string; n: number }>([
      { $group: { _id: "$category", n: { $sum: 1 } } },
    ])
    .toArray();
  console.log(
    "\nMongo cdt_codes categories:",
    cats.sort((a, b) => a._id.localeCompare(b._id)),
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => closeMongoClient());
