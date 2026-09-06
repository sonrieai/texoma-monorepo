import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnvLocal } from "../src/lib/mongo/sync";
import { extractOpenDentalProcCatId } from "../src/lib/nexhealth/open-dental-proc-cat";
import { listProcedureCodeDescriptors } from "../src/lib/nexhealth/client";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
loadEnvLocal(repoRoot);

async function main() {
  const rows = await listProcedureCodeDescriptors();
  const byCode: Record<string, number> = {};
  for (const row of rows) {
    const code = row.code?.trim().toUpperCase();
    const procCat = extractOpenDentalProcCatId(row);
    if (code && procCat != null) byCode[code] = procCat;
  }
  writeFileSync(
    join(repoRoot, "exports/open-dental/existing-proccat-by-code.json"),
    JSON.stringify(byCode, null, 2),
  );
  console.log(`Wrote ${Object.keys(byCode).length} codes`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
