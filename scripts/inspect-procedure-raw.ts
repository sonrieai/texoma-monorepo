import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnvLocal } from "../src/lib/env/load-env-local";
import { closeMongoClient, COLLECTIONS, getCollection } from "../src/lib/mongo/client";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
loadEnvLocal(repoRoot);

async function main() {
  const proc = await getCollection(COLLECTIONS.procedures).findOne({
    procedureCode: { $regex: /^D7140/i },
  });
  console.log("procedure raw keys", Object.keys(proc?.raw ?? {}));
  console.log(JSON.stringify(proc?.raw, null, 2).slice(0, 2500));

  const charge = await getCollection(COLLECTIONS.charges).findOne({
    procedureCode: { $regex: /^D7140/i },
  });
  console.log("\ncharge raw keys", Object.keys(charge?.raw ?? {}));
  console.log(JSON.stringify(charge?.raw, null, 2).slice(0, 1500));
}

main()
  .catch(console.error)
  .finally(() => closeMongoClient());
