/**
 * GoHighLevel calendar appointments for Open Dental → GHL sync.
 * Creates/updates real appointment objects (required for WF-91 / WF-96).
 */

import { getGhlConfig } from "@/lib/ghl/config";
import { ghlFetch } from "@/lib/ghl/http";
import { odWallDateTimeToIso } from "@/lib/ghl/practice-time";
import type { GhlConfig } from "@/lib/ghl/types";
import { OdAptStatus } from "@/lib/opendental/types";

export type GhlAppointmentStatus =
  | "confirmed"
  | "showed"
  | "noshow"
  | "cancelled"
  | "completed";

export type OdAppointmentForGhl = {
  aptNum: number;
  aptStatus: number;
  aptDateTime: Date | string | null;
  pattern: string | null;
  title: string | null;
};

type AppointmentPayload = {
  id?: string;
  appointment?: { id?: string };
};

const DEFAULT_DURATION_MINUTES = 30;
const PATTERN_MINUTES_PER_CHAR = 5;

export function odPatternDurationMinutes(pattern: string | null | undefined): number {
  const text = (pattern ?? "").trim();
  if (!text) return DEFAULT_DURATION_MINUTES;
  return Math.max(PATTERN_MINUTES_PER_CHAR, text.length * PATTERN_MINUTES_PER_CHAR);
}

/** Map Open Dental AptStatus to a GHL appointmentStatus. */
export function mapOdAptStatusToGhl(aptStatus: number): GhlAppointmentStatus {
  if (aptStatus === OdAptStatus.Complete) return "showed";
  if (aptStatus === OdAptStatus.Broken) return "noshow";
  if (aptStatus === OdAptStatus.Scheduled || aptStatus === OdAptStatus.ASAP) {
    return "confirmed";
  }
  return "cancelled";
}

/** Naive OD DATETIME → absolute ISO (America/Chicago wall time). */
export function odAptDateTimeToIso(
  value: Date | string | null | undefined,
): string | null {
  return odWallDateTimeToIso(value);
}

export function appointmentEndIso(
  startIso: string,
  pattern: string | null | undefined,
): string {
  const start = new Date(startIso);
  const end = new Date(start.getTime() + odPatternDurationMinutes(pattern) * 60_000);
  return end.toISOString();
}

function eventIdFrom(payload: AppointmentPayload | null): string | null {
  const id = payload?.appointment?.id ?? payload?.id;
  return typeof id === "string" && id.trim() ? id.trim() : null;
}

export function getGhlCalendarId(): string | null {
  return process.env.GHL_CALENDAR_ID?.trim() || null;
}

/** Required by some GHL calendars (Round Robin / personal). Front Desk default in env. */
export function getGhlAssignedUserId(): string | null {
  return process.env.GHL_ASSIGNED_USER_ID?.trim() || null;
}

export async function upsertGhlAppointment(params: {
  contactId: string;
  previousEventId: string | null;
  appointment: OdAppointmentForGhl;
  config?: GhlConfig;
}): Promise<string | null> {
  const calendarId = getGhlCalendarId();
  if (!calendarId) return null;
  const startTime = odAptDateTimeToIso(params.appointment.aptDateTime);
  if (!startTime) return null;
  const cfg = params.config ?? (await getGhlConfig());
  const endTime = appointmentEndIso(startTime, params.appointment.pattern);
  const appointmentStatus = mapOdAptStatusToGhl(params.appointment.aptStatus);
  const title =
    params.appointment.title?.trim() ||
    `Open Dental #${params.appointment.aptNum}`;
  const assignedUserId = getGhlAssignedUserId();
  const body: Record<string, unknown> = {
    calendarId,
    locationId: cfg.locationId,
    contactId: params.contactId,
    startTime,
    endTime,
    title,
    description: `od_aptnum=${params.appointment.aptNum}`,
    appointmentStatus,
    toNotify: false,
    ignoreDateRange: true,
    ignoreFreeSlotValidation: true,
  };
  if (assignedUserId) body.assignedUserId = assignedUserId;

  if (params.previousEventId) {
    const updated = await ghlFetch<AppointmentPayload>(
      `/calendars/events/appointments/${encodeURIComponent(params.previousEventId)}`,
      { method: "PUT", body: JSON.stringify(body) },
      cfg,
    );
    return eventIdFrom(updated) ?? params.previousEventId;
  }

  const created = await ghlFetch<AppointmentPayload>(
    "/calendars/events/appointments",
    { method: "POST", body: JSON.stringify(body) },
    cfg,
  );
  const id = eventIdFrom(created);
  if (!id) throw new Error("GoHighLevel appointment create did not return an id");
  return id;
}
