/**
 * GoHighLevel contact upsert and no-show tag swap.
 * Callers pass name, phone, and email only for the request. Nothing here is stored.
 */

import { getGhlConfig } from "@/lib/ghl/config";
import { ghlFetch, GhlApiError } from "@/lib/ghl/http";
import {
  NO_SHOW_TAG_LIST,
  type NoShowTag,
} from "@/lib/ghl/od-disposition-tags";
import type { GhlConfig } from "@/lib/ghl/types";

/** Spec field key; also accept legacy od_pat_num via env id. */
export const OD_PATNUM_FIELD_KEY = "od_patnum";
export const OD_APTNUM_FIELD_KEY = "od_aptnum";
export const OD_LAST_SYNC_FIELD_KEY = "od_last_sync";
export const OD_CONSULT_DATE_FIELD_KEY = "od_consult_date";
export const OD_MISSED_APPT_DATE_FIELD_KEY = "od_missed_appt_date";
export const OD_NEXT_APPT_DATE_FIELD_KEY = "od_next_appt_date";
export const OD_APPT_BOOKED_TAG = "od-appt-booked";

export const ACTIVE_SEQUENCE = {
  newInquiries: "New Inquiries",
  none: "None",
} as const;

export type ActiveSequenceValue =
  (typeof ACTIVE_SEQUENCE)[keyof typeof ACTIVE_SEQUENCE];

export type GhlContactInput = {
  patNum: number;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  email: string | null;
  /** Latest OD AptNum written on the contact (spec od_aptnum). */
  aptNum?: number | null;
  /** ISO date (YYYY-MM-DD) for od_last_sync. */
  lastSyncYmd?: string | null;
  activeSequence?: ActiveSequenceValue | null;
  /** Next upcoming consult date (America/Chicago YYYY-MM-DD); empty clears. */
  consultDateYmd?: string | null;
  /** Date of no-show/cancel just detected. */
  missedApptDateYmd?: string | null;
  /** Patient’s next scheduled appt after a miss (empty if none). */
  nextApptDateYmd?: string | null;
  /** When true, write empty string to clear consult/missed/next as specified. */
  clearConsultDate?: boolean;
  clearMissedApptDate?: boolean;
  clearNextApptDate?: boolean;
};

type ContactPayload = {
  id?: string;
  contact?: { id?: string };
};

function contactIdFrom(payload: ContactPayload | null): string | null {
  const id = payload?.contact?.id ?? payload?.id;
  return typeof id === "string" && id.trim() ? id.trim() : null;
}

function fieldEntry(
  key: string,
  value: string,
  envId: string | undefined,
): Record<string, string> {
  const field: Record<string, string> = { key, field_value: value };
  const id = envId?.trim();
  if (id) field.id = id;
  return field;
}

export function contactCustomFields(
  input: GhlContactInput,
): Array<Record<string, string>> {
  const fields: Array<Record<string, string>> = [
    fieldEntry(
      OD_PATNUM_FIELD_KEY,
      String(input.patNum),
      process.env.GHL_OD_PATNUM_FIELD_ID,
    ),
  ];
  if (input.aptNum != null && Number.isFinite(input.aptNum)) {
    fields.push(
      fieldEntry(
        OD_APTNUM_FIELD_KEY,
        String(input.aptNum),
        process.env.GHL_OD_APTNUM_FIELD_ID,
      ),
    );
  }
  if (input.lastSyncYmd?.trim()) {
    fields.push(
      fieldEntry(
        OD_LAST_SYNC_FIELD_KEY,
        input.lastSyncYmd.trim(),
        process.env.GHL_OD_LAST_SYNC_FIELD_ID,
      ),
    );
  }
  if (input.activeSequence) {
    fields.push(
      fieldEntry(
        "active_sequence",
        input.activeSequence,
        process.env.GHL_ACTIVE_SEQUENCE_FIELD_ID,
      ),
    );
  }
  if (input.clearConsultDate) {
    fields.push(
      fieldEntry(
        OD_CONSULT_DATE_FIELD_KEY,
        "",
        process.env.GHL_OD_CONSULT_DATE_FIELD_ID,
      ),
    );
  } else if (input.consultDateYmd?.trim()) {
    fields.push(
      fieldEntry(
        OD_CONSULT_DATE_FIELD_KEY,
        input.consultDateYmd.trim(),
        process.env.GHL_OD_CONSULT_DATE_FIELD_ID,
      ),
    );
  }
  if (input.clearMissedApptDate) {
    fields.push(
      fieldEntry(
        OD_MISSED_APPT_DATE_FIELD_KEY,
        "",
        process.env.GHL_OD_MISSED_APPT_DATE_FIELD_ID,
      ),
    );
  } else if (input.missedApptDateYmd?.trim()) {
    fields.push(
      fieldEntry(
        OD_MISSED_APPT_DATE_FIELD_KEY,
        input.missedApptDateYmd.trim(),
        process.env.GHL_OD_MISSED_APPT_DATE_FIELD_ID,
      ),
    );
  }
  if (input.clearNextApptDate) {
    fields.push(
      fieldEntry(
        OD_NEXT_APPT_DATE_FIELD_KEY,
        "",
        process.env.GHL_OD_NEXT_APPT_DATE_FIELD_ID,
      ),
    );
  } else if (input.nextApptDateYmd?.trim()) {
    fields.push(
      fieldEntry(
        OD_NEXT_APPT_DATE_FIELD_KEY,
        input.nextApptDateYmd.trim(),
        process.env.GHL_OD_NEXT_APPT_DATE_FIELD_ID,
      ),
    );
  }
  return fields;
}

function contactBody(
  input: GhlContactInput,
  locationId?: string,
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    firstName: input.firstName?.trim() || undefined,
    lastName: input.lastName?.trim() || undefined,
    source: "Open Dental",
    customFields: contactCustomFields(input),
  };
  if (locationId) body.locationId = locationId;
  if (input.phone) body.phone = input.phone;
  if (input.email) body.email = input.email;
  return body;
}

export async function upsertGhlContact(
  input: GhlContactInput,
  config?: GhlConfig,
): Promise<string> {
  const cfg = config ?? (await getGhlConfig());
  const payload = await ghlFetch<ContactPayload>(
    "/contacts/upsert",
    {
      method: "POST",
      body: JSON.stringify(contactBody(input, cfg.locationId)),
    },
    cfg,
  );
  const id = contactIdFrom(payload);
  if (!id) throw new Error("GoHighLevel upsert did not return a contact id");
  return id;
}

/** Create a contact only when resolve found no match (prefer over blind upsert). */
export async function createGhlContact(
  input: GhlContactInput,
  config?: GhlConfig,
): Promise<string> {
  const cfg = config ?? (await getGhlConfig());
  const payload = await ghlFetch<ContactPayload>(
    "/contacts/",
    {
      method: "POST",
      body: JSON.stringify(contactBody(input, cfg.locationId)),
    },
    cfg,
  );
  const id = contactIdFrom(payload);
  if (!id) throw new Error("GoHighLevel create did not return a contact id");
  return id;
}

type DndChannel = { status?: string; message?: string; code?: string };
type ContactDndView = {
  dnd?: boolean;
  dndSettings?: { SMS?: DndChannel; Email?: DndChannel; Call?: DndChannel };
};

export async function getContactSmsDnd(
  contactId: string,
  config?: GhlConfig,
): Promise<boolean> {
  const data = await ghlFetch<{ contact?: ContactDndView } & ContactDndView>(
    `/contacts/${encodeURIComponent(contactId)}`,
    {},
    config,
  );
  const contact = data.contact ?? data;
  const sms = contact.dndSettings?.SMS?.status?.toLowerCase();
  if (sms === "active") return true;
  if (sms === "inactive") return false;
  return contact.dnd === true;
}

/**
 * Apply Text OK → SMS DND. Never clears existing DND on Yes.
 * - set_dnd: force SMS DND on
 * - allow_if_not_dnd: leave alone when already DND; otherwise ensure SMS not DND
 * - no_text_keep_dnd: set SMS DND (do not enable texting); keep any existing DND
 */
export type SmsDndActionKind = "set_dnd" | "allow_if_not_dnd" | "no_text_keep_dnd";

export async function applySmsConsentDnd(params: {
  contactId: string;
  action: { kind: SmsDndActionKind };
  config?: GhlConfig;
}): Promise<void> {
  const alreadyDnd = await getContactSmsDnd(params.contactId, params.config);
  if (params.action.kind === "allow_if_not_dnd") {
    if (alreadyDnd) return;
    // Contact is not DND and OD says Yes — leave SMS enabled (no write needed).
    return;
  }
  // set_dnd and no_text_keep_dnd both ensure SMS channel is DND / not textable.
  if (alreadyDnd && params.action.kind === "no_text_keep_dnd") return;
  await ghlFetch(
    `/contacts/${encodeURIComponent(params.contactId)}`,
    {
      method: "PUT",
      body: JSON.stringify({
        dndSettings: {
          SMS: { status: "active", message: "", code: "" },
        },
      }),
    },
    params.config,
  );
}

export async function updateGhlContact(
  contactId: string,
  input: GhlContactInput,
  config?: GhlConfig,
): Promise<void> {
  await ghlFetch(
    `/contacts/${encodeURIComponent(contactId)}`,
    {
      method: "PUT",
      body: JSON.stringify(contactBody(input)),
    },
    config,
  );
}

/**
 * Write Active Sequence last (after contact + appointment), per integration spec.
 */
export async function setActiveSequence(
  contactId: string,
  value: ActiveSequenceValue,
  config?: GhlConfig,
): Promise<void> {
  const fieldId = process.env.GHL_ACTIVE_SEQUENCE_FIELD_ID?.trim();
  const customFields = [
    fieldEntry("active_sequence", value, fieldId),
  ];
  await ghlFetch(
    `/contacts/${encodeURIComponent(contactId)}`,
    {
      method: "PUT",
      body: JSON.stringify({ customFields }),
    },
    config,
  );
}

/** Write only od_consult_date; empty string clears it. */
export async function setContactConsultDate(
  contactId: string,
  ymd: string,
  config?: GhlConfig,
): Promise<void> {
  const customFields = [
    fieldEntry(
      OD_CONSULT_DATE_FIELD_KEY,
      ymd,
      process.env.GHL_OD_CONSULT_DATE_FIELD_ID,
    ),
  ];
  await ghlFetch(
    `/contacts/${encodeURIComponent(contactId)}`,
    {
      method: "PUT",
      body: JSON.stringify({ customFields }),
    },
    config,
  );
}

async function postTags(
  contactId: string,
  method: "POST" | "DELETE",
  tags: readonly string[],
  config?: GhlConfig,
): Promise<void> {
  if (tags.length === 0) return;
  try {
    await ghlFetch(
      `/contacts/${encodeURIComponent(contactId)}/tags`,
      {
        method,
        body: JSON.stringify({ tags: [...tags] }),
      },
      config,
    );
  } catch (err) {
    if (
      method === "DELETE" &&
      err instanceof GhlApiError &&
      (err.status === 400 || err.status === 404)
    ) {
      return;
    }
    throw err;
  }
}

/** Add tags without removing the ones already on the contact. */
export async function addContactTags(
  contactId: string,
  tags: readonly string[],
  config?: GhlConfig,
): Promise<void> {
  await postTags(contactId, "POST", tags, config);
}

export async function removeContactTags(
  contactId: string,
  tags: readonly string[],
  config?: GhlConfig,
): Promise<void> {
  await postTags(contactId, "DELETE", tags, config);
}

/** Set or clear the od-appt-booked tag from has_future_appt. */
export async function setOdApptBookedTag(params: {
  contactId: string;
  booked: boolean;
  previouslyBooked: boolean;
  config?: GhlConfig;
}): Promise<void> {
  if (params.booked && !params.previouslyBooked) {
    await addContactTags(params.contactId, [OD_APPT_BOOKED_TAG], params.config);
  } else if (!params.booked && params.previouslyBooked) {
    await removeContactTags(
      params.contactId,
      [OD_APPT_BOOKED_TAG],
      params.config,
    );
  }
}

/** Remove the other no-show tags, then add the one tag that should remain. */
export async function replaceNoShowTag(params: {
  contactId: string;
  next: NoShowTag | null;
  config?: GhlConfig;
}): Promise<void> {
  const remove = NO_SHOW_TAG_LIST.filter((tag) => tag !== params.next);
  await postTags(params.contactId, "DELETE", remove, params.config);
  if (params.next) {
    await postTags(params.contactId, "POST", [params.next], params.config);
  }
}
