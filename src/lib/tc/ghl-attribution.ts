import type { TcCoordinator } from "@/lib/tc/discover-coordinators";

type GhlAssigneeOpp = {
  assignedTo?: string | null;
  assigned_to?: string | null;
  assignedUserId?: string | null;
  assigned_to_user_id?: string | null;
  assignedToId?: string | null;
  userId?: string | null;
  user?: { id?: string; name?: string | null } | null;
  assignedUser?: { id?: string; name?: string | null } | null;
};

export function extractOpportunityAssigneeId(
  opp: GhlAssigneeOpp,
): string | null {
  const candidates = [
    opp.assignedUserId,
    opp.assigned_to_user_id,
    opp.assignedToId,
    opp.userId,
    opp.user?.id,
    opp.assignedUser?.id,
  ];
  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) return c.trim();
  }
  return null;
}

export function extractOpportunityAssigneeName(
  opp: GhlAssigneeOpp,
): string | null {
  const candidates = [
    opp.assignedTo,
    opp.assigned_to,
    opp.user?.name,
    opp.assignedUser?.name,
  ];
  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) return c.trim();
  }
  return null;
}

export function opportunityBelongsToCoordinator(
  opp: GhlAssigneeOpp,
  coordinator: TcCoordinator,
): boolean {
  const assigneeName = extractOpportunityAssigneeName(opp);
  if (!assigneeName) return false;

  const lower = assigneeName.toLowerCase();
  const coordLower = coordinator.name.toLowerCase();
  if (lower === coordLower || lower.includes(coordLower) || coordLower.includes(lower)) {
    return true;
  }

  const first = coordLower.split(/\s+/)[0];
  return first.length > 2 && lower.includes(first);
}
