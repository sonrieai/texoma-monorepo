import "server-only";

import { listGhlOpportunitiesInRange } from "@/lib/ghl/opportunities";
import { readOdGhlSyncState } from "@/lib/ghl/od-ghl-sync-state";
import { resolveTcPipelineId } from "@/lib/ghl/tc-stage-tiers";
import { coordinatorGhlUserId } from "@/lib/tc/coordinator-ghl-ids";
import {
  extractOpportunityAssigneeId,
  extractOpportunityAssigneeName,
} from "@/lib/tc/ghl-attribution";
import type { PresentedPlan } from "@/lib/tc/presented-plans";

type CoordinatorSlug = "ashlie" | "brie";

function ghlCoordinatorSlug(
  assigneeId: string | null,
  assigneeName: string | null,
): CoordinatorSlug | null {
  const ashId = coordinatorGhlUserId("ashlie");
  const brieId = coordinatorGhlUserId("brie");
  if (assigneeId && ashId && assigneeId === ashId) return "ashlie";
  if (assigneeId && brieId && assigneeId === brieId) return "brie";
  const lower = (assigneeName ?? "").toLowerCase();
  if (/\bashlie\b/.test(lower)) return "ashlie";
  if (/\bbrie\b/.test(lower)) return "brie";
  return null;
}

function odCoordinatorSlug(
  name: PresentedPlan["coordinatorName"],
): CoordinatorSlug | null {
  if (name === "Ashlie") return "ashlie";
  if (name === "Brie") return "brie";
  return null;
}

/** Item 7 — OD visit-code coordinator wins; surface GHL assignee mismatches. */
export async function buildCoordinatorAttributionNotices(params: {
  fromYmd: string;
  toYmd: string;
  presented: PresentedPlan[];
}): Promise<string[]> {
  const notices: string[] = [];
  const odByPatient = new Map<number, CoordinatorSlug>();
  for (const row of params.presented) {
    if (row.patientId == null) continue;
    const slug = odCoordinatorSlug(row.coordinatorName);
    if (slug) odByPatient.set(row.patientId, slug);
  }
  if (odByPatient.size === 0) return notices;

  const state = await readOdGhlSyncState();
  const contactToPat = new Map<string, number>();
  for (const [pat, link] of Object.entries(state.contacts)) {
    const id = link.ghlContactId?.trim();
    if (id) contactToPat.set(id, Number(pat));
  }

  const tcPipeline = resolveTcPipelineId();
  const contexts = await listGhlOpportunitiesInRange({
    startYmd: params.fromYmd,
    endYmd: params.toYmd,
  });
  let disagreements = 0;
  let linked = 0;
  for (const { opp, pipelineId } of contexts) {
    if (pipelineId !== tcPipeline) continue;
    const contactId = opp.contactId?.trim();
    if (!contactId) continue;
    const patNum = contactToPat.get(contactId);
    if (patNum == null) continue;
    const odSlug = odByPatient.get(patNum);
    if (!odSlug) continue;
    linked += 1;
    const ghlSlug = ghlCoordinatorSlug(
      extractOpportunityAssigneeId(opp),
      extractOpportunityAssigneeName(opp),
    );
    if (ghlSlug && ghlSlug !== odSlug) disagreements += 1;
  }

  notices.push(
    "Treatment coordinator production uses Open Dental visit codes; GoHighLevel card assignee is secondary.",
  );
  if (linked > 0 && disagreements > 0) {
    notices.push(
      `${disagreements} TC card(s) in this period assign a different coordinator than Open Dental visit codes (OD wins for production).`,
    );
  }
  return notices;
}
