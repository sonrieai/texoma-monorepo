/**
 * Read-only GoHighLevel hygiene checks (Change Spec Phase 0).
 * Does not delete anything — reports counts only.
 */
import { loadEnvLocal } from "../src/lib/env/load-env-local";
import { getGhlConfig, isGhlConfigured } from "../src/lib/ghl/config";
import { ghlFetch } from "../src/lib/ghl/http";
import { LEADS_FAKE_LEAD_STAGE_ID } from "../src/lib/ghl/funnel-stage-tiers";

loadEnvLocal();

const DELETED_TC_NO_SHOW = "b09a8f58-4eb9-4159-a1c3-2869cc408dc0";

async function main() {
  if (!(await isGhlConfigured())) {
    console.error("GHL not configured");
    process.exitCode = 1;
    return;
  }
  const config = await getGhlConfig();
  let cardsInDeletedStage = 0;
  let fakeLeadStage = 0;
  let page = 0;
  while (page < 5) {
    const q = new URLSearchParams({
      location_id: config.locationId,
      status: "all",
      limit: "100",
    });
    const data = await ghlFetch<{ opportunities?: Array<{ pipelineStageId?: string }> }>(
      `/opportunities/search?${q.toString()}`,
      {},
      config,
    );
    const batch = data.opportunities ?? [];
    if (batch.length === 0) break;
    for (const o of batch) {
      const sid = o.pipelineStageId ?? "";
      if (sid === DELETED_TC_NO_SHOW) cardsInDeletedStage += 1;
      if (sid === LEADS_FAKE_LEAD_STAGE_ID) fakeLeadStage += 1;
    }
    if (batch.length < 100) break;
    page += 1;
  }
  console.log("GHL hygiene (sampled search, read-only):");
  console.log(`  Cards in deleted TC No-Show stage (${DELETED_TC_NO_SHOW}): ${cardsInDeletedStage}`);
  console.log(`  Cards in Fake Lead stage: ${fakeLeadStage}`);
  console.log("  Run full duplicate od_patnum audit in GHL UI or a dedicated export.");
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
