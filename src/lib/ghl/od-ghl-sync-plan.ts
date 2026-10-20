/**
 * Pure decisions for the Open Dental → GoHighLevel poll.
 * No patient names, phones, or emails.
 */

import type { ActiveSequenceValue } from "@/lib/ghl/contacts";
import type { NoShowTag, TagEffect } from "@/lib/ghl/od-disposition-tags";
import type { OdGhlContactLink } from "@/lib/ghl/od-ghl-sync-state";
import { toCentralYmd } from "@/lib/ghl/practice-time";

export {
  PRACTICE_TIME_ZONE,
  toCentralYmd,
  todayCentralYmd,
} from "@/lib/ghl/practice-time";

/** Open Dental patient.TxtMsgOk (YN enum). */
export const OdTxtMsgOk = {
  Unknown: 0,
  Yes: 1,
  No: 2,
} as const;

export type OdTxtMsgOkValue = (typeof OdTxtMsgOk)[keyof typeof OdTxtMsgOk];

export function normalizeUsPhone(raw: string | null | undefined): string | null {
  const digits = (raw ?? "").replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
}

export function normalizeEmail(raw: string | null | undefined): string | null {
  const email = (raw ?? "").trim().toLowerCase();
  if (!email.includes("@")) return null;
  const [local, domain] = email.split("@");
  if (!local || !domain || !domain.includes(".")) return null;
  return email;
}

/**
 * Active Sequence rules (diagram):
 * - Booked → None
 * - Newly created GHL contact, unbooked → New Inquiries
 * - Existing contact, unbooked → leave unchanged (null)
 */
export function resolveActiveSequence(params: {
  hasFutureAppt: boolean;
  isNewContact: boolean;
}): ActiveSequenceValue | null {
  if (params.hasFutureAppt) return "None";
  if (params.isNewContact) return "New Inquiries";
  return null;
}

/** @deprecated Use resolveActiveSequence — never map !hasFutureAppt alone to New Inquiries. */
export function activeSequenceForFutureAppt(
  hasFutureAppt: boolean,
): ActiveSequenceValue {
  return hasFutureAppt ? "None" : "New Inquiries";
}

/**
 * Text OK → SMS policy. Yes never clears existing GHL DND.
 * Returns whether to set SMS DND (true), leave alone (false = no change when already DND
 * or when Yes and not DND), or force off for blank.
 */
export type SmsConsentAction =
  | { kind: "set_dnd" }
  | { kind: "allow_if_not_dnd" }
  | { kind: "no_text_keep_dnd" };

export function smsConsentAction(txtMsgOk: number | null | undefined): SmsConsentAction {
  if (txtMsgOk === OdTxtMsgOk.Yes) return { kind: "allow_if_not_dnd" };
  if (txtMsgOk === OdTxtMsgOk.No) return { kind: "set_dnd" };
  return { kind: "no_text_keep_dnd" };
}

export function syncAlreadyApplied(
  previous: OdGhlContactLink | null,
  effect: TagEffect,
  hasFutureAppt: boolean,
): boolean {
  if (!previous?.ghlContactId) return false;
  if (previous.hasFutureAppt !== hasFutureAppt) return false;
  // Existing contacts no longer flip to New Inquiries when unbooked.
  if (hasFutureAppt) {
    if (previous.activeSequence !== "None") return false;
  }
  if (effect === "leave") return true;
  if (effect === "clear") return previous.noShowTag == null;
  return previous.noShowTag === effect;
}

/** @deprecated Prefer syncAlreadyApplied with hasFutureAppt. Kept for older tests. */
export function syncAlreadyAppliedLegacy(
  previous: { ghlContactId: string; noShowTag: NoShowTag | null } | null,
  effect: TagEffect,
): boolean {
  if (!previous?.ghlContactId) return false;
  if (effect === "leave") return true;
  if (effect === "clear") return previous.noShowTag == null;
  return previous.noShowTag === effect;
}

export type MissedApptSignal = {
  missedDateYmd: string;
  reason: "no_show" | "cancel" | "broken";
};

/** Detect no-show / cancel / broken from a changed appointment row. */
export function missedSignalFromAppointment(input: {
  aptStatus: number;
  brokenStatus: number;
  confirmFamily: "no_show" | "team_cancel" | "patient_cancel" | "reschedule" | null;
  aptDateTime: Date | string | null;
}): MissedApptSignal | null {
  const ymd = toCentralYmd(input.aptDateTime);
  if (!ymd) return null;
  if (input.aptStatus === input.brokenStatus) {
    return { missedDateYmd: ymd, reason: "broken" };
  }
  if (input.confirmFamily === "no_show") {
    return { missedDateYmd: ymd, reason: "no_show" };
  }
  if (
    input.confirmFamily === "team_cancel" ||
    input.confirmFamily === "patient_cancel"
  ) {
    return { missedDateYmd: ymd, reason: "cancel" };
  }
  return null;
}

/**
 * Next consult date among future rows that look like consults (type/proc line).
 * Clear when empty.
 */
export function nextConsultDateYmd(
  future: readonly { AptDateTime: Date | string | null; isConsult: boolean }[],
): string | null {
  for (const row of future) {
    if (!row.isConsult) continue;
    const ymd = toCentralYmd(row.AptDateTime);
    if (ymd) return ymd;
  }
  return null;
}

export function nextScheduledApptDateYmd(
  future: readonly { AptDateTime: Date | string | null }[],
): string | null {
  for (const row of future) {
    const ymd = toCentralYmd(row.AptDateTime);
    if (ymd) return ymd;
  }
  return null;
}
