/**
 * Pure decisions for the Open Dental → GoHighLevel poll.
 * No patient names, phones, or emails.
 */

import type { NoShowTag, TagEffect } from "@/lib/ghl/od-disposition-tags";

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

export function syncAlreadyApplied(
  previous: { ghlContactId: string; noShowTag: NoShowTag | null } | null,
  effect: TagEffect,
): boolean {
  if (!previous?.ghlContactId) return false;
  if (effect === "leave") return true;
  if (effect === "clear") return previous.noShowTag == null;
  return previous.noShowTag === effect;
}
