/**
 * Resolve a GHL contact: od_patnum → phone → email.
 * Create only when nothing matches; flag unclear phone/email splits.
 */

import { ghlFetch } from "@/lib/ghl/http";
import { addContactTags, OD_PATNUM_FIELD_KEY } from "@/lib/ghl/contacts";
import type { GhlConfig } from "@/lib/ghl/types";

export const OD_MATCH_REVIEW_TAG = "od-match-review";

export type ContactResolveInput = {
  patNum: number;
  phone: string | null;
  email: string | null;
};

export type ContactResolveResult =
  | { kind: "found"; contactId: string; via: "patnum" | "phone" | "email" }
  | { kind: "unclear"; contactIds: string[]; reason: string }
  | { kind: "none" };

type SearchHit = { id?: string; contact?: { id?: string } };

function idOf(row: SearchHit | null | undefined): string | null {
  const id = row?.contact?.id ?? row?.id;
  return typeof id === "string" && id.trim() ? id.trim() : null;
}

async function searchByPatNum(
  patNum: number,
  config: GhlConfig,
): Promise<string | null> {
  const fieldId = process.env.GHL_OD_PATNUM_FIELD_ID?.trim();
  const body: Record<string, unknown> = {
    locationId: config.locationId,
    page: 1,
    pageLimit: 5,
    filters: [
      fieldId
        ? {
            field: "customFields",
            operator: "eq",
            value: String(patNum),
            extra: { customFieldId: fieldId },
          }
        : {
            field: `customFields.${OD_PATNUM_FIELD_KEY}`,
            operator: "eq",
            value: String(patNum),
          },
    ],
  };
  try {
    const data = await ghlFetch<{ contacts?: SearchHit[] }>(
      "/contacts/search",
      { method: "POST", body: JSON.stringify(body) },
      config,
    );
    const ids = (data.contacts ?? [])
      .map((c) => idOf(c))
      .filter((x): x is string => Boolean(x));
    return ids[0] ?? null;
  } catch {
    // Fall through to phone/email if search shape differs by API version.
    return null;
  }
}

async function lookupByPhoneOrEmail(
  kind: "phone" | "email",
  value: string,
  config: GhlConfig,
): Promise<string | null> {
  const params = new URLSearchParams({ locationId: config.locationId });
  if (kind === "phone") params.set("number", value);
  else params.set("email", value);
  try {
    const data = await ghlFetch<{ contact?: SearchHit; contacts?: SearchHit[] }>(
      `/contacts/search/duplicate?${params.toString()}`,
      {},
      config,
    );
    if (data.contact) return idOf(data.contact);
    const first = data.contacts?.[0];
    return idOf(first ?? null);
  } catch {
    return null;
  }
}

export async function resolveGhlContact(
  input: ContactResolveInput,
  config: GhlConfig,
): Promise<ContactResolveResult> {
  const byPat = await searchByPatNum(input.patNum, config);
  if (byPat) return { kind: "found", contactId: byPat, via: "patnum" };

  const byPhone = input.phone
    ? await lookupByPhoneOrEmail("phone", input.phone, config)
    : null;
  const byEmail = input.email
    ? await lookupByPhoneOrEmail("email", input.email, config)
    : null;

  if (byPhone && byEmail && byPhone !== byEmail) {
    return {
      kind: "unclear",
      contactIds: [byPhone, byEmail],
      reason: "phone and email match different contacts",
    };
  }
  if (byPhone) return { kind: "found", contactId: byPhone, via: "phone" };
  if (byEmail) return { kind: "found", contactId: byEmail, via: "email" };
  return { kind: "none" };
}

export async function flagUnclearMatch(
  contactIds: readonly string[],
  config: GhlConfig,
): Promise<void> {
  for (const id of contactIds) {
    await addContactTags(id, [OD_MATCH_REVIEW_TAG], config);
  }
}
