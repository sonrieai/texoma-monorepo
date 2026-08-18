/**
 * Export all NexHealth API JSON responses to exports/nexhealth/ for review.
 *
 * Usage:
 *   npm run export:nexhealth              → exports/nexhealth/ (overwrites)
 *   npm run export:nexhealth -- --out dir
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnvLocal } from "../src/lib/mongo/sync";
import { exportNexHealthJson } from "../src/lib/nexhealth/export-json";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
loadEnvLocal(repoRoot);

const args = process.argv.slice(2);
const outIdx = args.indexOf("--out");
const outputDir =
  outIdx >= 0 && args[outIdx + 1]
    ? join(repoRoot, args[outIdx + 1])
    : join(repoRoot, "exports", "nexhealth");

async function main() {
  console.log(`Exporting NexHealth JSON → ${outputDir}`);

  const result = await exportNexHealthJson({ outputDir });

  console.log(JSON.stringify({
    ok: result.ok,
    outputDir: result.outputDir,
    manifest: result.manifestFile,
    fieldKeys: result.fieldKeysFile,
    resources: result.files.map((f) => ({
      resource: f.resource,
      ok: f.ok,
      items: f.itemCount,
      pages: f.pageCount,
      keys: f.fieldKeys.length,
      error: f.error,
    })),
  }, null, 2));

  if (!result.ok) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
