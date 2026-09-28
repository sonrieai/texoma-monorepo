import { loadEnvLocal } from "../src/lib/env/load-env-local";
import { closeMongoClient, getCollection } from "../src/lib/mongo/client";

async function main() {
  loadEnvLocal();
  const col = await getCollection("cdt_codes");
  const total = await col.countDocuments({});
  const tCodeCount = await col.countDocuments({ code: /^T/i });
  const withFee1 = await col.countDocuments({ fee1: { $nin: [null, ""] } });
  const withAnyFee = await col.countDocuments({
    $or: [
      { fee1: { $nin: [null, ""] } },
      { fee2: { $nin: [null, ""] } },
      { fee3: { $nin: [null, ""] } },
    ],
  });
  const sampleTCodes = await col
    .find({ code: /^T/i })
    .project({ code: 1, description: 1, fee1: 1, fee2: 1, fee3: 1, category: 1 })
    .sort({ code: 1 })
    .limit(5)
    .toArray();

  console.log(
    JSON.stringify({ total, tCodeCount, withFee1, withAnyFee, sampleTCodes }, null, 2),
  );
  await closeMongoClient();
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
