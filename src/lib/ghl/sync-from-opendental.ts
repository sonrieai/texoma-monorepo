/**
 * Poll Open Dental for new patients and appointment dispositions,
 * then upsert one GoHighLevel contact, new-patient tags, and one no-show tag.
 */

import { getGhlConfig } from "@/lib/ghl/config";
import {
  addContactTags,
  replaceNoShowTag,
  updateGhlContact,
  upsertGhlContact,
  type GhlContactInput,
} from "@/lib/ghl/contacts";
import { GhlApiError } from "@/lib/ghl/http";
import {
  appointmentTagEffect,
  consultLineForAppointment,
  foldTagEffects,
  isSoldProcedureCode,
  pendingNewPatientTags,
  type ConsultLine,
  type NewPatientTag,
  type NoShowTag,
  type TagEffect,
} from "@/lib/ghl/od-disposition-tags";
import {
  readOdGhlSyncState,
  writeOdGhlSyncState,
  type OdGhlContactLink,
} from "@/lib/ghl/od-ghl-sync-state";
import { normalizeEmail, normalizeUsPhone, syncAlreadyApplied } from "@/lib/ghl/od-ghl-sync-plan";
import {
  listOdAppointmentProcedureCodes,
  listOdAppointmentsForGhlSync,
  listOdPatientsForGhlByIds,
  listOdPatientsForGhlSync,
  listOdSoldProceduresForGhlSync,
  odDatabaseNow,
  odStampToCursor,
  type OdGhlPatientContactRow,
} from "@/lib/opendental/ghl-sync-queries";
import { OdAptStatus, OdProcStatus } from "@/lib/opendental/types";
import type { GhlConfig } from "@/lib/ghl/types";

export type OdGhlSyncResult = {
  initializedCursor: boolean;
  patients: number;
  upserted: number;
  tagged: number;
  cleared: number;
  unchanged: number;
  skippedNoContact: number;
  failed: number;
};

type TimedEffect = { at: string; effect: TagEffect };

function laterCursor(current: string, stamp: string | null): string {
  if (!stamp || stamp <= current) return current;
  return stamp;
}

export function patientContactInput(
  row: OdGhlPatientContactRow,
): GhlContactInput | null {
  const phone =
    normalizeUsPhone(row.WirelessPhone) ?? normalizeUsPhone(row.HmPhone);
  const email = normalizeEmail(row.Email);
  if (!phone && !email) return null;
  return {
    patNum: row.PatNum,
    firstName: row.FName?.trim() || null,
    lastName: row.LName?.trim() || null,
    phone,
    email,
  };
}

function mergeNewPatientTags(
  previous: readonly NewPatientTag[] | undefined,
  added: readonly NewPatientTag[],
): NewPatientTag[] {
  const tags: NewPatientTag[] = [];
  for (const tag of [...(previous ?? []), ...added]) {
    if (!tags.includes(tag)) tags.push(tag);
  }
  return tags;
}

async function applyPatient(params: {
  input: GhlContactInput | null;
  effect: TagEffect;
  lines: readonly ConsultLine[];
  previous: OdGhlContactLink | null;
  config: GhlConfig;
}): Promise<
  | { kind: "skipped" }
  | {
      kind: "ok";
      upserted: boolean;
      tagChange: "tagged" | "cleared" | "unchanged";
      link: OdGhlContactLink;
    }
> {
  let contactId = params.previous?.ghlContactId;
  let upserted = false;
  let firstSend = !contactId;

  if (contactId && params.input) {
    try {
      await updateGhlContact(contactId, params.input, params.config);
    } catch (err) {
      if (err instanceof GhlApiError && err.status === 404) contactId = undefined;
      else throw err;
    }
  }

  if (!contactId) {
    if (!params.input) return { kind: "skipped" };
    contactId = await upsertGhlContact(params.input, params.config);
    upserted = true;
    firstSend = true;
  }

  const tagsToAdd = firstSend
    ? pendingNewPatientTags(null, params.lines)
    : pendingNewPatientTags(params.previous, params.lines);
  if (tagsToAdd.length > 0) {
    await addContactTags(contactId, tagsToAdd, params.config);
  }
  const newPatientTags =
    firstSend || params.previous?.newPatientTags
      ? mergeNewPatientTags(params.previous?.newPatientTags, tagsToAdd)
      : undefined;

  const previousTag = params.previous?.noShowTag ?? null;
  const linkTags = newPatientTags ? { newPatientTags } : {};

  if (params.effect === "leave") {
    return {
      kind: "ok",
      upserted,
      tagChange: tagsToAdd.length > 0 ? "tagged" : "unchanged",
      link: { ghlContactId: contactId, noShowTag: previousTag, ...linkTags },
    };
  }

  if (params.effect === "clear") {
    if (previousTag) {
      await replaceNoShowTag({
        contactId,
        next: null,
        config: params.config,
      });
      return {
        kind: "ok",
        upserted,
        tagChange: "cleared",
        link: { ghlContactId: contactId, noShowTag: null, ...linkTags },
      };
    }
    return {
      kind: "ok",
      upserted,
      tagChange: tagsToAdd.length > 0 ? "tagged" : "unchanged",
      link: { ghlContactId: contactId, noShowTag: null, ...linkTags },
    };
  }

  const next: NoShowTag = params.effect;
  if (previousTag === next) {
    return {
      kind: "ok",
      upserted,
      tagChange: tagsToAdd.length > 0 ? "tagged" : "unchanged",
      link: { ghlContactId: contactId, noShowTag: next, ...linkTags },
    };
  }
  await replaceNoShowTag({ contactId, next, config: params.config });
  return {
    kind: "ok",
    upserted,
    tagChange: "tagged",
    link: { ghlContactId: contactId, noShowTag: next, ...linkTags },
  };
}

export async function runOdGhlSync(): Promise<OdGhlSyncResult> {
  const state = await readOdGhlSyncState();
  if (!state.cursor) {
    state.cursor = await odDatabaseNow();
    await writeOdGhlSyncState(state);
    return {
      initializedCursor: true,
      patients: 0,
      upserted: 0,
      tagged: 0,
      cleared: 0,
      unchanged: 0,
      skippedNoContact: 0,
      failed: 0,
    };
  }

  const since = state.cursor;
  const [changedPatients, appointments, sold] = await Promise.all([
    listOdPatientsForGhlSync(since),
    listOdAppointmentsForGhlSync(since),
    listOdSoldProceduresForGhlSync(since),
  ]);
  const procedureCodes = await listOdAppointmentProcedureCodes(
    appointments.map((row) => row.AptNum),
  );
  const codesByApt = new Map<number, string[]>();
  for (const row of procedureCodes) {
    const list = codesByApt.get(row.AptNum) ?? [];
    list.push(row.ProcCode);
    codesByApt.set(row.AptNum, list);
  }

  const events = new Map<number, TimedEffect[]>();
  const linesByPatient = new Map<number, ConsultLine[]>();
  const touch = (patNum: number, event: TimedEffect) => {
    const list = events.get(patNum) ?? [];
    list.push(event);
    events.set(patNum, list);
  };
  const noteLine = (patNum: number, line: ConsultLine | null) => {
    if (!line) return;
    const list = linesByPatient.get(patNum) ?? [];
    if (!list.includes(line)) list.push(line);
    linesByPatient.set(patNum, list);
  };

  let cursor = since;
  for (const patient of changedPatients) {
    const at = odStampToCursor(patient.DateTStamp) ?? "";
    cursor = laterCursor(cursor, at || null);
    touch(patient.PatNum, { at, effect: "leave" });
  }
  for (const appt of appointments) {
    const at = odStampToCursor(appt.DateTStamp);
    cursor = laterCursor(cursor, at);
    if (!at) continue;
    const procedureCodes = codesByApt.get(appt.AptNum) ?? [];
    noteLine(
      appt.PatNum,
      consultLineForAppointment({
        appointmentTypeName: appt.AppointmentTypeName,
        procedureCodes,
      }),
    );
    touch(appt.PatNum, {
      at,
      effect: appointmentTagEffect({
        completed: appt.AptStatus === OdAptStatus.Complete,
        confirmName: appt.ConfirmedName,
        appointmentTypeName: appt.AppointmentTypeName,
        procedureCodes,
      }),
    });
  }
  for (const proc of sold) {
    const at = odStampToCursor(proc.DateTStamp);
    cursor = laterCursor(cursor, at);
    if (!at || proc.ProcStatus !== OdProcStatus.Complete) continue;
    if (!isSoldProcedureCode(proc.ProcCode)) continue;
    touch(proc.PatNum, { at, effect: "clear" });
  }

  const known = new Set(changedPatients.map((row) => row.PatNum));
  const missingIds = [...events.keys()].filter((id) => !known.has(id));
  const extraPatients = await listOdPatientsForGhlByIds(missingIds);
  const patientsById = new Map<number, OdGhlPatientContactRow>();
  for (const row of [...changedPatients, ...extraPatients]) {
    patientsById.set(row.PatNum, row);
  }

  const config = events.size > 0 ? await getGhlConfig() : null;
  let upserted = 0;
  let tagged = 0;
  let cleared = 0;
  let unchanged = 0;
  let skippedNoContact = 0;
  let failed = 0;

  for (const [patNum, list] of events) {
    const effect = foldTagEffects(
      [...list].sort((a, b) => a.at.localeCompare(b.at)).map((row) => row.effect),
    );
    const key = String(patNum);
    const previous = state.contacts[key] ?? null;
    const lines = linesByPatient.get(patNum) ?? [];
    if (
      syncAlreadyApplied(previous, effect) &&
      pendingNewPatientTags(previous, lines).length === 0
    ) {
      unchanged += 1;
      continue;
    }
    const row = patientsById.get(patNum);
    const input = row ? patientContactInput(row) : null;
    if (!config) continue;
    try {
      const outcome = await applyPatient({
        input,
        effect,
        lines,
        previous,
        config,
      });
      if (outcome.kind === "skipped") {
        skippedNoContact += 1;
        continue;
      }
      state.contacts[key] = outcome.link;
      if (outcome.upserted) upserted += 1;
      if (outcome.tagChange === "tagged") tagged += 1;
      else if (outcome.tagChange === "cleared") cleared += 1;
      else unchanged += 1;
    } catch (err) {
      failed += 1;
      const status = err instanceof GhlApiError ? ` (${err.status})` : "";
      console.error(`GoHighLevel sync failed for PatNum ${patNum}${status}`);
    }
  }

  if (failed === 0) state.cursor = cursor;
  await writeOdGhlSyncState(state);

  return {
    initializedCursor: false,
    patients: events.size,
    upserted,
    tagged,
    cleared,
    unchanged,
    skippedNoContact,
    failed,
  };
}
