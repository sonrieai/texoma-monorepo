/**
 * Normalized decline / denial reason labels for TC charts.
 * Shared by Open Dental treatment plans and GoHighLevel opportunities.
 */

export type DeclineReasonRow = {
  reason: string;
  count: number;
};

export function normalizeDeclineReason(text: string): string {
  const t = text.toLowerCase();
  if (/cost|afford|price|expensive|money/.test(t)) return "Cost / affordability";
  if (/financ|credit|loan|declin/.test(t)) return "Financing declined";
  if (/think|time|later|consider/.test(t)) return "Wants to think it over";
  if (/spouse|family|partner|husband|wife/.test(t)) {
    return "Needs spouse / family OK";
  }
  if (/second opinion|another doctor|elsewhere/.test(t)) {
    return "Seeking second opinion";
  }
  if (/fear|anxiety|scared|nervous/.test(t)) return "Fear / anxiety";
  if (/insurance|coverage|benefit/.test(t)) return "Insurance / coverage";
  if (/no-?show|missed appointment/.test(t)) return "No-show / missed consult";
  return text.length > 48 ? `${text.slice(0, 45)}…` : text;
}

const DECLINED_PLAN_STATUSES = new Set([
  "rejected",
  "declined",
  "inactive",
  "deleted",
]);

export function isDeclinedTreatmentPlanStatus(
  status: string | null | undefined,
): boolean {
  if (!status) return false;
  return DECLINED_PLAN_STATUSES.has(status.toLowerCase());
}

export function extractDeclineReasonLabel(
  raw: Record<string, unknown>,
): string | null {
  const candidates = [
    raw.decline_reason,
    raw.rejection_reason,
    raw.reject_reason,
    raw.notes,
    raw.note,
    raw.name,
  ];
  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) {
      return normalizeDeclineReason(c.trim());
    }
  }
  return null;
}

export function declineReasonFromPlanFields(
  raw: Record<string, unknown>,
): string {
  return extractDeclineReasonLabel(raw) ?? "Other";
}

export function isGhlDeclineOpportunity(
  stageName: string | null | undefined,
  status?: string | null,
): boolean {
  const oppStatus = (status ?? "").toLowerCase();
  if (oppStatus === "lost" || oppStatus === "abandoned") return true;
  const stage = (stageName ?? "").toLowerCase();
  if (!stage) return false;
  return (
    /declin|not interested|no treatment|didn't close|did not accept|did not move|lost deal|passed|pass up|unqualified|denied|not ready|no sale|no-go|no go|not moving|dead|think it over|no decision|not proceeding/.test(
      stage,
    )
  );
}

export function declineReasonFromGhlStage(
  stageName: string | null | undefined,
  status?: string | null,
): string {
  const stage = (stageName ?? "").trim();
  const oppStatus = (status ?? "").trim();
  const label = stage || oppStatus || "Other";
  return normalizeDeclineReason(label);
}

export function mergeDeclineReasons(
  ...groups: DeclineReasonRow[][]
): DeclineReasonRow[] {
  const map = new Map<string, number>();
  for (const group of groups) {
    for (const row of group) {
      if (row.count <= 0) continue;
      map.set(row.reason, (map.get(row.reason) ?? 0) + row.count);
    }
  }
  return [...map.entries()]
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count);
}

export function declineReasonTotal(rows: DeclineReasonRow[]): number {
  return rows.reduce((sum, row) => sum + row.count, 0);
}
