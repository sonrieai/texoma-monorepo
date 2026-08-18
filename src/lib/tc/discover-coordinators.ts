/**
 * Discover treatment coordinators from synced NexHealth / Open Dental data.
 * No hardcoded names — roster is built from plan ownership and TC appointments.
 */

import {
  appointmentTypeId,
  providerDisplayName,
  type NexAppointment,
  type NexAppointmentType,
  type NexProvider,
  type NexTreatmentPlan,
} from "@/lib/nexhealth/client";
import { coordinatorSlug } from "@/lib/tc/coordinators";

export type TcCoordinator = {
  slug: string;
  name: string;
  /** NexHealth provider id and/or OD user id seen on plans. */
  attributionIds: number[];
  planCount: number;
  appointmentCount: number;
};

const TC_APPOINTMENT_NAME_PATTERN =
  /\b(treatment coordinator|tc consult|tx consult|coordinator consult|tx coord)\b/i;

const PLAN_USER_ID_KEYS = [
  "user_id",
  "user_num",
  "presenter_id",
  "presenter_num",
  "created_by_user_id",
  "updated_by_user_id",
  "treatment_coordinator_id",
  "coordinator_id",
] as const;

const PLAN_USER_NAME_KEYS = [
  "user_name",
  "presenter_name",
  "coordinator_name",
  "created_by_name",
  "treatment_coordinator_name",
] as const;

const NESTED_USER_OBJECTS = [
  "user",
  "presenter",
  "created_by",
  "treatment_coordinator",
  "coordinator",
] as const;

export type PlanCoordinatorRef = {
  attributionIds: number[];
  name: string | null;
};

function parsePositiveInt(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.trunc(value);
  }
  if (typeof value === "string") {
    const n = Number.parseInt(value.trim(), 10);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

function readNestedUser(
  raw: Record<string, unknown>,
  key: string,
): { id: number | null; name: string | null } {
  const nested = raw[key];
  if (!nested || typeof nested !== "object") {
    return { id: null, name: null };
  }
  const obj = nested as Record<string, unknown>;
  const id =
    parsePositiveInt(obj.id) ??
    parsePositiveInt(obj.user_id) ??
    parsePositiveInt(obj.user_num);
  const name =
    typeof obj.name === "string"
      ? obj.name.trim()
      : typeof obj.full_name === "string"
        ? obj.full_name.trim()
        : null;
  return { id, name: name || null };
}

/** Extract OD / NexHealth presenter or coordinator reference from a treatment plan raw payload. */
export function extractPlanCoordinatorRef(
  plan: NexTreatmentPlan,
): PlanCoordinatorRef | null {
  const raw = plan as Record<string, unknown>;
  const attributionIds = new Set<number>();
  let name: string | null = null;

  for (const key of PLAN_USER_ID_KEYS) {
    const id = parsePositiveInt(raw[key]);
    if (id != null) attributionIds.add(id);
  }

  for (const key of PLAN_USER_NAME_KEYS) {
    const value = raw[key];
    if (typeof value === "string" && value.trim()) {
      name = value.trim();
      break;
    }
  }

  for (const key of NESTED_USER_OBJECTS) {
    const nested = readNestedUser(raw, key);
    if (nested.id != null) attributionIds.add(nested.id);
    if (!name && nested.name) name = nested.name;
  }

  if (attributionIds.size === 0 && !name) return null;

  return {
    attributionIds: [...attributionIds],
    name,
  };
}

export function resolveTcAppointmentTypeIds(
  types: NexAppointmentType[],
): { ids: number[]; source: "name_match" | "none" } {
  const matched = types
    .filter((t) => TC_APPOINTMENT_NAME_PATTERN.test(t.name?.trim() || ""))
    .map((t) => t.id);
  if (matched.length > 0) return { ids: matched, source: "name_match" };
  return { ids: [], source: "none" };
}

function providerName(
  providerId: number,
  providers: NexProvider[],
): string {
  const match = providers.find((p) => p.id === providerId);
  if (match) return providerDisplayName(match);
  return `Staff ${providerId}`;
}

function mergeCoordinator(
  map: Map<string, TcCoordinator>,
  entry: {
    slug: string;
    name: string;
    attributionIds: number[];
    planDelta?: number;
    appointmentDelta?: number;
  },
): void {
  const existing = map.get(entry.slug);
  if (!existing) {
    map.set(entry.slug, {
      slug: entry.slug,
      name: entry.name,
      attributionIds: [...new Set(entry.attributionIds)],
      planCount: entry.planDelta ?? 0,
      appointmentCount: entry.appointmentDelta ?? 0,
    });
    return;
  }

  existing.planCount += entry.planDelta ?? 0;
  existing.appointmentCount += entry.appointmentDelta ?? 0;
  for (const id of entry.attributionIds) {
    if (!existing.attributionIds.includes(id)) {
      existing.attributionIds.push(id);
    }
  }
  if (entry.name.length > existing.name.length) {
    existing.name = entry.name;
  }
}

export function discoverTcCoordinators(params: {
  plans: NexTreatmentPlan[];
  appointments: NexAppointment[];
  appointmentTypes: NexAppointmentType[];
  providers: NexProvider[];
}): TcCoordinator[] {
  const map = new Map<string, TcCoordinator>();
  const { ids: tcTypeIds } = resolveTcAppointmentTypeIds(params.appointmentTypes);
  const tcTypeSet = new Set(tcTypeIds);

  for (const plan of params.plans) {
    const ref = extractPlanCoordinatorRef(plan);
    if (!ref) continue;

    const resolvedName =
      ref.name ??
      (ref.attributionIds[0] != null
        ? providerName(ref.attributionIds[0], params.providers)
        : null);
    if (!resolvedName) continue;

    mergeCoordinator(map, {
      slug: coordinatorSlug(resolvedName),
      name: resolvedName,
      attributionIds: ref.attributionIds,
      planDelta: 1,
    });
  }

  for (const appt of params.appointments) {
    const typeId = appointmentTypeId(appt);
    if (typeId == null || !tcTypeSet.has(typeId)) continue;
    const providerId = appt.provider_id;
    if (providerId == null) continue;

    const name = providerName(providerId, params.providers);
    mergeCoordinator(map, {
      slug: coordinatorSlug(name),
      name,
      attributionIds: [providerId],
      appointmentDelta: 1,
    });
  }

  return [...map.values()].sort(
    (a, b) =>
      b.planCount - a.planCount ||
      b.appointmentCount - a.appointmentCount ||
      a.name.localeCompare(b.name),
  );
}

export function findDiscoveredCoordinator(
  coordinators: TcCoordinator[],
  slug: string,
): TcCoordinator | null {
  const normalized = coordinatorSlug(slug);
  return coordinators.find((c) => c.slug === normalized) ?? null;
}
