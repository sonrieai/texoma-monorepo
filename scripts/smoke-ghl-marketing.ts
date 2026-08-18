/**
 * Smoke-test: npx tsx scripts/smoke-ghl-marketing.ts
 * Loads .env.local manually (no dotenv package).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadEnvLocal() {
  try {
    const text = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq < 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let val = trimmed.slice(eq + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (!key) continue;
      process.env[key] = val;
    }
  } catch {
    // ignore
  }
}

async function main() {
  loadEnvLocal();
  const { loadMarketingSummary } = await import("../src/lib/ghl/marketing");
  const s = await loadMarketingSummary();
  console.log(
    JSON.stringify(
      {
        available: s.available,
        opps: s.opportunityCount,
        channels: s.channels.slice(0, 8).map((c) => ({
          n: c.name,
          l: c.leads,
          b: c.booked,
          sh: c.showed,
          a: c.accepted,
          su: c.surgery,
          p: c.production,
        })),
        totals: s.totals,
        notices: s.notices,
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
