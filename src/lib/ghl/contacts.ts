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

const PATNUM_FIELD_KEY = "od_pat_num";

export type GhlContactInput = {
  patNum: number;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  email: string | null;
};

type ContactPayload = {
  id?: string;
  contact?: { id?: string };
};

function contactIdFrom(payload: ContactPayload | null): string | null {
  const id = payload?.contact?.id ?? payload?.id;
  return typeof id === "string" && id.trim() ? id.trim() : null;
}

function patNumFields(patNum: number): Array<Record<string, string>> {
  const fieldId = process.env.GHL_OD_PATNUM_FIELD_ID?.trim();
  const field: Record<string, string> = {
    key: PATNUM_FIELD_KEY,
    field_value: String(patNum),
  };
  if (fieldId) field.id = fieldId;
  return [field];
}

function contactBody(input: GhlContactInput, locationId?: string): Record<string, unknown> {
  const body: Record<string, unknown> = {
    firstName: input.firstName?.trim() || undefined,
    lastName: input.lastName?.trim() || undefined,
    source: "Open Dental",
    customFields: patNumFields(input.patNum),
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
