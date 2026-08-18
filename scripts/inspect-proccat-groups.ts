import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnvLocal } from "../src/lib/mongo/sync";
import { closeMongoClient } from "../src/lib/mongo/client";
import { listProcedureCodeDescriptors } from "../src/lib/nexhealth/client";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
loadEnvLocal(repoRoot);

async function main() {
  const rows = await listProcedureCodeDescriptors();
  const byProcCat = new Map<number, { codes: string[]; dataKeys: Set<string> }>();

  for (const row of rows) {
    const data = row.data as Record<string, unknown> | undefined;
    const procCat = data?.ProcCat;
    if (typeof procCat !== "number") continue;
    let bucket = byProcCat.get(procCat);
    if (!bucket) {
      bucket = { codes: [], dataKeys: new Set() };
      byProcCat.set(procCat, bucket);
    }
    if (row.code) bucket.codes.push(row.code);
    if (data) Object.keys(data).forEach((k) => bucket!.dataKeys.add(k));
  }

  console.log(
    "ProcCat groups:",
    [...byProcCat.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([id, v]) => ({
        procCat: id,
        sampleCodes: v.codes.slice(0, 3),
        dataKeys: [...v.dataKeys],
      })),
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => closeMongoClient());
