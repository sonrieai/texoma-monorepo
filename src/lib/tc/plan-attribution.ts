import type { TreatmentPlanRecord } from "@/lib/warehouse/types";
import {
  extractPlanCoordinatorRef,
  type PlanCoordinatorRef,
} from "@/lib/tc/discover-coordinators";
import type { TcCoordinator } from "@/lib/tc/discover-coordinators";

export function planPatientId(plan: TreatmentPlanRecord): number | null {
  if (typeof plan.patient_id === "number") return plan.patient_id;
  for (const proc of plan.procedures ?? []) {
    if (typeof proc.patient_id === "number") return proc.patient_id;
  }
  return null;
}

function planMatchesCoordinatorRef(
  ref: PlanCoordinatorRef,
  coordinator: TcCoordinator,
): boolean {
  if (
    ref.attributionIds.some((id) => coordinator.attributionIds.includes(id))
  ) {
    return true;
  }
  if (ref.name) {
    return coordinatorSlugMatch(ref.name, coordinator.name);
  }
  return false;
}

function coordinatorSlugMatch(a: string, b: string): boolean {
  const na = a.trim().toLowerCase();
  const nb = b.trim().toLowerCase();
  return na === nb || na.includes(nb) || nb.includes(na);
}

export function planBelongsToCoordinator(
  plan: TreatmentPlanRecord,
  coordinator: TcCoordinator,
): boolean {
  const ref = extractPlanCoordinatorRef(plan);
  if (!ref) return false;
  return planMatchesCoordinatorRef(ref, coordinator);
}

export function coordinatorPatientIds(
  plans: TreatmentPlanRecord[],
  coordinator: TcCoordinator,
): Set<number> {
  const ids = new Set<number>();
  for (const plan of plans) {
    if (!planBelongsToCoordinator(plan, coordinator)) continue;
    const pid = planPatientId(plan);
    if (pid != null) ids.add(pid);
  }
  return ids;
}

export function filterPlansForCoordinator(
  plans: TreatmentPlanRecord[],
  coordinator: TcCoordinator,
): TreatmentPlanRecord[] {
  return plans.filter((plan) => planBelongsToCoordinator(plan, coordinator));
}

/** @deprecated use extractPlanCoordinatorRef */
export function extractPlanUserId(plan: TreatmentPlanRecord): number | null {
  const ref = extractPlanCoordinatorRef(plan);
  return ref?.attributionIds[0] ?? null;
}
