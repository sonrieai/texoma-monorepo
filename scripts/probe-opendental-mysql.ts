/**
 * PHI-safe Open Dental MySQL probe CLI.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/probe-opendental-mysql.ts
 *   npm run probe:opendental-mysql
 */
import { loadEnvLocal } from "../src/lib/env/load-env-local";
import { probeOpenDentalMysql } from "../src/lib/opendental/probe";

// CLI: register-server-only-stub is applied via npm script --require when present.
loadEnvLocal();

async function main() {
  const result = await probeOpenDentalMysql();
  console.log("Open Dental MySQL probe");
  console.log(
    `  configured: ${result.configured}  connected: ${result.connected}  ok: ${result.ok}`,
  );
  if (result.config) {
    console.log(
      `  host: ${result.config.host}:${result.config.port}  db: ${result.config.database}  user: ${result.config.user}`,
    );
  }
  if (result.serverVersion) {
    console.log(`  server: ${result.serverVersion}`);
  }
  if (result.grantsReadonly != null) {
    console.log(
      `  grants: ${result.grantsReadonly ? "SELECT-only (heuristic)" : "MAY INCLUDE WRITE PRIVILEGES"}`,
    );
  }
  for (const line of result.grantSummary.slice(0, 5)) {
    console.log(`    ${line}`);
  }
  console.log("");
  console.log("Tables:");
  for (const t of result.tables) {
    const count =
      t.rowCount == null ? "n/a" : t.rowCount.toLocaleString("en-US");
    console.log(
      `  [${t.present ? "OK" : "MISSING"}] ${t.table.padEnd(18)} rows=${count}`,
    );
  }
  if (result.errors.length) {
    console.log("");
    console.log("Notes / errors:");
    for (const e of result.errors) console.log(`  - ${e}`);
  }
  if (!result.ok) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
