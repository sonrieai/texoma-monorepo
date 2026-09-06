import { listGhlOpportunitiesInRange } from "@/lib/ghl/opportunities";
import type { MarketingRange } from "@/lib/ghl/marketing";
import type { TcCoordinator } from "@/lib/tc/discover-coordinators";
import {
  declineReasonFromGhlStage,
  isGhlDeclineOpportunity,
  type DeclineReasonRow,
} from "@/lib/tc/decline-reasons";

export async function loadGhlDeclineReasons(
  range: MarketingRange,
  coordinator?: TcCoordinator,
): Promise<{ reasons: DeclineReasonRow[]; total: number; available: boolean }> {
  try {
    const contexts = await listGhlOpportunitiesInRange(range, coordinator);
    const map = new Map<string, number>();

    for (const { opp, stageName } of contexts) {
      if (!isGhlDeclineOpportunity(stageName, opp.status)) continue;
      const reason = declineReasonFromGhlStage(stageName, opp.status);
      map.set(reason, (map.get(reason) ?? 0) + 1);
    }

    const reasons = [...map.entries()]
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count);
    const total = reasons.reduce((sum, row) => sum + row.count, 0);

    return { reasons, total, available: total > 0 };
  } catch {
    return { reasons: [], total: 0, available: false };
  }
}
