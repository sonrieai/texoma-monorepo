import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnvLocal } from "../src/lib/mongo/sync";
import { closeMongoClient } from "../src/lib/mongo/client";
import { getNexHealthConfig, listAppointmentDescriptors } from "../src/lib/nexhealth/client";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
loadEnvLocal(repoRoot);

async function main() {
  const filters = [
    undefined,
    "Proc Code Categories",
    "Procedure Code Categories",
    "Definitions",
    "Opendental Proc Code Categories",
    "Category",
  ];
  for (const descriptorType of filters) {
    const rows = await listAppointmentDescriptors({
      ...(descriptorType ? { descriptorType } : {}),
      maxPages: 2,
      perPage: 100,
    });
    console.log(
      descriptorType ?? "(all)",
      "count",
      rows.length,
      rows[0]
        ? { type: rows[0].descriptor_type, code: rows[0].code, data: rows[0].data }
        : null,
    );
  }
}

main()
  .catch(console.error)
  .finally(() => closeMongoClient());
