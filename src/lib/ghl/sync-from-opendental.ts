/**
 * Poll Open Dental for new patients and appointment dispositions,
 * then resolve contact → appointment → Active Sequence (spec order).
 */

import { upsertGhlAppointment } from "@/lib/ghl/appointments";
import {
  assertTexomaGhlLocation,
  getGhlConfig,
  isGhlConfiguredFromEnv,
} from "@/lib/ghl/config";
import {
  flagUnclearMatch,
  resolveGhlContact,
} from "@/lib/ghl/contact-resolve";
import {
  ACTIVE_SEQUENCE,
  addContactTags,
  applySmsConsentDnd,
  createGhlContact,
  replaceNoShowTag,
  setActiveSequence,
  setOdApptBookedTag,
  updateGhlContact,
  type GhlContactInput,
} from "@/lib/ghl/contacts";
import { upsertOdSyncLastSuccess } from "@/lib/ghl/custom-values";
import { GhlApiError } from "@/lib/ghl/http";
import { defaultGhlBaseUrl } from "@/lib/mongo/integration-settings";
import {
  appointmentTagEffect,
  classifyConfirmName,
  consultLineForAppointment,
  foldTagEffects,
  isConsultAppointment,
  isSoldProcedureCode,
  pendingNewPatientTags,
  type ConsultLine,
  type NewPatientTag,
  type NoShowTag,
  type TagEffect,
} from "@/lib/ghl/od-disposition-tags";
import {
  OD_GHL_SYNC_MODES,
  readOdGhlSyncState,
  writeOdGhlSyncState,
  type OdGhlAppointmentLink,
  type OdGhlContactLink,
  type OdGhlSyncMode,
  type OdGhlSyncRunMode,
} from "@/lib/ghl/od-ghl-sync-state";
import {
  missedSignalFromAppointment,
  nextConsultDateYmd,
  nextScheduledApptDateYmd,
  normalizeEmail,
  normalizeUsPhone,
  patNumsByContact,
  resolveActiveSequence,
  smsConsentAction,
  todayCentralYmd,
  toCentralYmd,
} from "@/lib/ghl/od-ghl-sync-plan";
import {
  ensureNoShowCancelledOpportunity,
  requireLeadsNoShowStageConfig,
} from "@/lib/ghl/opportunity-stage";
import {
  listOdAppointmentProcedureCodes,
  listOdConsultAppointmentsForGhlSync,
  listOdFutureAppointmentsForPatients,
  listOdNonConsultAppointmentsForGhlSync,
  listOdPatientsForGhlByIds,
  listOdPatientsForGhlSync,
  listOdSoldProceduresForGhlSync,
  odDatabaseNow,
  odStampToCursor,
  type OdGhlAppointmentRow,
  type OdGhlFutureAppointmentRow,
  type OdGhlPatientContactRow,
} from "@/lib/opendental/ghl-sync-queries";
import { OdAptStatus, OdProcStatus } from "@/lib/opendental/types";
import type { GhlConfig } from "@/lib/ghl/types";

export type OdGhlSyncOptions = {
  /** When true, count patients only — no GHL writes and no cursor advance. */
  dryRun?: boolean;
  /**
   * `consults` = 5-minute job. Overnight: `patients` / `appointments` / `sold`.
   * `all` is for e2e / one-shot tests only.
   */
  mode?: OdGhlSyncRunMode;
};

export type OdGhlSyncResult = {
  initializedCursor: boolean;
  dryRun: boolean;
  mode: OdGhlSyncRunMode;
  patients: number;
  withFutureAppt: number;
  nurtureEligible: number;
  upserted: number;
  tagged: number;
  cleared: number;
  unchanged: number;
  skippedNoContact: number;
  failed: number;
  appointmentsWritten: number;
  /** Dry-run only: contacts that would be created (no patnum/phone/email match). */
  wouldCreateContacts?: number;
  wouldMatchExisting?: number;
  wouldSkipUnclear?: number;
  lastSuccessfulRunAt?: string | null;
};

type TimedEffect = { at: string; effect: TagEffect };

/** OD sync always uses the Texoma sub-account (env preferred over Settings). */
export async function getTexomaGhlConfigForSync(): Promise<GhlConfig> {
  if (isGhlConfiguredFromEnv()) {
    const locationId = process.env.GHL_LOCATION_ID!.trim();
    const apiKey = process.env.GHL_API_KEY!.trim();
    return assertTexomaGhlLocation({
      apiKey,
      locationId,
      baseUrl: (process.env.GHL_BASE_URL?.trim() || defaultGhlBaseUrl()).replace(
        /\/$/,
        "",
      ),
      sourceCustomFieldId:
        process.env.GHL_SOURCE_CUSTOM_FIELD_ID?.trim() || null,
    });
  }
  return assertTexomaGhlLocation(await getGhlConfig());
}

function laterCursor(current: string, stamp: string | null): string {
  if (!stamp || stamp <= current) return current;
  return stamp;
}

function todayYmd(): string {
  return todayCentralYmd();
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

function pickPrimaryAppointment(
  future: readonly OdGhlFutureAppointmentRow[],
  changed: readonly OdGhlAppointmentRow[],
): OdGhlAppointmentRow | OdGhlFutureAppointmentRow | null {
  if (future.length > 0) return future[0] ?? null;
  const scheduled = changed
    .filter((row) => row.AptStatus === OdAptStatus.Scheduled)
    .sort((a, b) =>
      String(a.AptDateTime ?? "").localeCompare(String(b.AptDateTime ?? "")),
    );
  if (scheduled[0]) return scheduled[0];
  const any = [...changed].sort((a, b) =>
    String(b.DateTStamp ?? "").localeCompare(String(a.DateTStamp ?? "")),
  );
  return any[0] ?? null;
}

function detectMissedSignal(
  changedAppts: readonly OdGhlAppointmentRow[],
  codesByApt: Map<number, string[]>,
): ReturnType<typeof missedSignalFromAppointment> {
  let latest: ReturnType<typeof missedSignalFromAppointment> = null;
  let latestStamp = "";
  for (const appt of changedAppts) {
    if (
      !isConsultAppointment({
        appointmentTypeName: appt.AppointmentTypeName,
        procedureCodes: codesByApt.get(appt.AptNum) ?? [],
      })
    ) {
      continue;
    }
    const family = classifyConfirmName(appt.ConfirmedName)?.family ?? null;
    const confirmFamily =
      family === "no_show" ||
      family === "team_cancel" ||
      family === "patient_cancel" ||
      family === "reschedule"
        ? family
        : null;
    const signal = missedSignalFromAppointment({
      aptStatus: appt.AptStatus,
      brokenStatus: OdAptStatus.Broken,
      confirmFamily:
        confirmFamily === "reschedule" ? null : confirmFamily,
      aptDateTime: appt.AptDateTime,
    });
    if (!signal) continue;
    const stamp = odStampToCursor(appt.DateTStamp) ?? "";
    if (!latest || stamp >= latestStamp) {
      latest = signal;
      latestStamp = stamp;
    }
  }
  return latest;
}

async function applyPatient(params: {
  input: GhlContactInput | null;
  patientRow: OdGhlPatientContactRow | null;
  effect: TagEffect;
  lines: readonly ConsultLine[];
  previous: OdGhlContactLink | null;
  hasFutureAppt: boolean;
  futureAppts: readonly OdGhlFutureAppointmentRow[];
  /** Future appts of every PatNum on the same GHL contact, by AptDateTime. */
  contactFutureAppts: readonly OdGhlFutureAppointmentRow[];
  changedAppts: readonly OdGhlAppointmentRow[];
  codesByApt: Map<number, string[]>;
  config: GhlConfig;
}): Promise<
  | { kind: "skipped" }
  | {
      kind: "ok";
      upserted: boolean;
      tagChange: "tagged" | "cleared" | "unchanged";
      appointmentsWritten: number;
      link: OdGhlContactLink;
    }
> {
  let contactId = params.previous?.ghlContactId;
  let upserted = false;
  let isNewContact = !contactId;
  const primary = pickPrimaryAppointment(
    params.futureAppts,
    params.changedAppts,
  );

  const consultDate = nextConsultDateYmd(
    params.contactFutureAppts.map((row) => ({
      AptDateTime: row.AptDateTime,
      isConsult: isConsultAppointment({
        appointmentTypeName: row.AppointmentTypeName,
        procedureCodes: params.codesByApt.get(row.AptNum) ?? [],
      }),
    })),
  );
  const missed = detectMissedSignal(params.changedAppts, params.codesByApt);
  const nextApptAfterMiss = missed
    ? nextScheduledApptDateYmd(params.futureAppts)
    : null;

  const baseInput: GhlContactInput | null = params.input
    ? {
        ...params.input,
        aptNum: primary?.AptNum ?? null,
        lastSyncYmd: todayYmd(),
        consultDateYmd: consultDate,
        clearConsultDate: !consultDate,
        ...(missed
          ? {
              missedApptDateYmd: missed.missedDateYmd,
              nextApptDateYmd: nextApptAfterMiss,
              clearNextApptDate: !nextApptAfterMiss,
            }
          : {}),
      }
    : null;

  // 1. Resolve / create / update contact (no Active Sequence yet)
  if (contactId && baseInput) {
    try {
      await updateGhlContact(contactId, baseInput, params.config);
    } catch (err) {
      const missing =
        err instanceof GhlApiError &&
        (err.status === 404 ||
          (err.status === 400 && /contact not found/i.test(err.message)));
      if (missing) contactId = undefined;
      else throw err;
    }
  }

  if (!contactId) {
    if (!baseInput) return { kind: "skipped" };
    const resolved = await resolveGhlContact(
      {
        patNum: baseInput.patNum,
        phone: baseInput.phone,
        email: baseInput.email,
      },
      params.config,
    );
    if (resolved.kind === "unclear") {
      await flagUnclearMatch(resolved.contactIds, params.config);
      console.error(
        `GoHighLevel match unclear for PatNum ${baseInput.patNum}: ${resolved.reason}`,
      );
      return { kind: "skipped" };
    }
    if (resolved.kind === "found") {
      contactId = resolved.contactId;
      await updateGhlContact(contactId, baseInput, params.config);
      isNewContact = false;
    } else {
      contactId = await createGhlContact(baseInput, params.config);
      upserted = true;
      isNewContact = true;
    }
  }

  // Text OK → SMS DND every run (Yes never clears existing DND)
  if (params.patientRow) {
    await applySmsConsentDnd({
      contactId,
      action: smsConsentAction(params.patientRow.TxtMsgOk),
      config: params.config,
    });
  }

  const tagsToAdd = isNewContact
    ? pendingNewPatientTags(null, params.lines)
    : pendingNewPatientTags(params.previous, params.lines);
  if (tagsToAdd.length > 0) {
    await addContactTags(contactId, tagsToAdd, params.config);
  }
  const newPatientTags =
    isNewContact || params.previous?.newPatientTags
      ? mergeNewPatientTags(params.previous?.newPatientTags, tagsToAdd)
      : undefined;

  // 2. Real GHL appointments (before Active Sequence); toNotify stays false
  const appointments: Record<string, OdGhlAppointmentLink> = {
    ...(params.previous?.appointments ?? {}),
  };
  let appointmentsWritten = 0;
  const toWrite = new Map<number, OdGhlAppointmentRow | OdGhlFutureAppointmentRow>();
  for (const row of params.changedAppts) toWrite.set(row.AptNum, row);
  for (const row of params.futureAppts) {
    if (!toWrite.has(row.AptNum)) toWrite.set(row.AptNum, row);
  }
  for (const appt of toWrite.values()) {
    const key = String(appt.AptNum);
    const previousEventId = appointments[key]?.ghlEventId ?? null;
    const eventId = await upsertGhlAppointment({
      contactId,
      previousEventId,
      appointment: {
        aptNum: appt.AptNum,
        aptStatus: appt.AptStatus,
        aptDateTime: appt.AptDateTime,
        pattern: appt.Pattern,
        title: appt.AppointmentTypeName,
      },
      config: params.config,
    });
    if (eventId) {
      appointments[key] = { ghlEventId: eventId };
      appointmentsWritten += 1;
    }
  }

  // 3. Active Sequence last + od-appt-booked (New Inquiries only for new contacts)
  const sequence = resolveActiveSequence({
    hasFutureAppt: params.hasFutureAppt,
    isNewContact,
  });
  await setOdApptBookedTag({
    contactId,
    booked: params.hasFutureAppt,
    previouslyBooked: params.previous?.hasFutureAppt === true,
    config: params.config,
  });
  if (sequence) {
    await setActiveSequence(contactId, sequence, params.config);
  }

  if (missed) {
    await ensureNoShowCancelledOpportunity({
      contactId,
      config: params.config,
    });
  }

  const previousTag = params.previous?.noShowTag ?? null;
  const linkTags = newPatientTags ? { newPatientTags } : {};
  const linkExtra = {
    appointments: Object.keys(appointments).length > 0 ? appointments : undefined,
    hasFutureAppt: params.hasFutureAppt,
    activeSequence: sequence ?? params.previous?.activeSequence ?? null,
  };

  if (params.effect === "leave") {
    return {
      kind: "ok",
      upserted,
      tagChange: tagsToAdd.length > 0 ? "tagged" : "unchanged",
      appointmentsWritten,
      link: {
        ghlContactId: contactId,
        noShowTag: previousTag,
        ...linkTags,
        ...linkExtra,
      },
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
        appointmentsWritten,
        link: {
          ghlContactId: contactId,
          noShowTag: null,
          ...linkTags,
          ...linkExtra,
        },
      };
    }
    return {
      kind: "ok",
      upserted,
      tagChange: tagsToAdd.length > 0 ? "tagged" : "unchanged",
      appointmentsWritten,
      link: {
        ghlContactId: contactId,
        noShowTag: null,
        ...linkTags,
        ...linkExtra,
      },
    };
  }

  const next: NoShowTag = params.effect;
  if (previousTag === next) {
    return {
      kind: "ok",
      upserted,
      tagChange: tagsToAdd.length > 0 ? "tagged" : "unchanged",
      appointmentsWritten,
      link: {
        ghlContactId: contactId,
        noShowTag: next,
        ...linkTags,
        ...linkExtra,
      },
    };
  }
  await replaceNoShowTag({ contactId, next, config: params.config });
  return {
    kind: "ok",
    upserted,
    tagChange: "tagged",
    appointmentsWritten,
    link: {
      ghlContactId: contactId,
      noShowTag: next,
      ...linkTags,
      ...linkExtra,
    },
  };
}

function modesForRun(mode: OdGhlSyncRunMode): OdGhlSyncMode[] {
  return mode === "all" ? [...OD_GHL_SYNC_MODES] : [mode];
}

export async function runOdGhlSync(
  options: OdGhlSyncOptions = {},
): Promise<OdGhlSyncResult> {
  const dryRun =
    options.dryRun === true ||
    process.env.GHL_OD_SYNC_DRY_RUN?.trim() === "1";
  const mode: OdGhlSyncRunMode = options.mode ?? "consults";

  const empty = (partial: Partial<OdGhlSyncResult>): OdGhlSyncResult => ({
    initializedCursor: false,
    dryRun,
    mode,
    patients: 0,
    withFutureAppt: 0,
    nurtureEligible: 0,
    upserted: 0,
    tagged: 0,
    cleared: 0,
    unchanged: 0,
    skippedNoContact: 0,
    failed: 0,
    appointmentsWritten: 0,
    ...partial,
  });

  const state = await readOdGhlSyncState();
  const runModes = modesForRun(mode);
  const missing = runModes.filter((key) => !state.cursors[key]);
  if (missing.length > 0) {
    if (dryRun) {
      return empty({ initializedCursor: true });
    }
    const now = await odDatabaseNow();
    for (const key of missing) state.cursors[key] = now;
    state.cursor = state.cursors.consults;
    await writeOdGhlSyncState(state);
    return empty({ initializedCursor: true });
  }

  const wantPatients = mode === "patients" || mode === "all";
  const wantConsults = mode === "consults" || mode === "all";
  const wantOtherAppts = mode === "appointments" || mode === "all";
  const wantSold = mode === "sold" || mode === "all";

  const [changedPatients, consultAppointments, otherAppointments, sold] =
    await Promise.all([
      wantPatients
        ? listOdPatientsForGhlSync(state.cursors.patients!)
        : Promise.resolve([]),
      wantConsults
        ? listOdConsultAppointmentsForGhlSync(state.cursors.consults!)
        : Promise.resolve([]),
      wantOtherAppts
        ? listOdNonConsultAppointmentsForGhlSync(state.cursors.appointments!)
        : Promise.resolve([]),
      wantSold
        ? listOdSoldProceduresForGhlSync(state.cursors.sold!)
        : Promise.resolve([]),
    ]);
  const appointments = [...consultAppointments, ...otherAppointments];
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
  const changedApptsByPatient = new Map<number, OdGhlAppointmentRow[]>();
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

  let nextPatients = state.cursors.patients!;
  let nextConsults = state.cursors.consults!;
  let nextAppointments = state.cursors.appointments!;
  let nextSold = state.cursors.sold!;

  for (const patient of changedPatients) {
    const at = odStampToCursor(patient.DateTStamp) ?? "";
    nextPatients = laterCursor(nextPatients, at || null);
    touch(patient.PatNum, { at, effect: "leave" });
  }

  const ingestAppointment = (appt: OdGhlAppointmentRow, advance: "consults" | "appointments") => {
    const at = odStampToCursor(appt.DateTStamp);
    if (advance === "consults") nextConsults = laterCursor(nextConsults, at);
    else nextAppointments = laterCursor(nextAppointments, at);
    if (!at) return;
    const list = changedApptsByPatient.get(appt.PatNum) ?? [];
    list.push(appt);
    changedApptsByPatient.set(appt.PatNum, list);
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
  };
  for (const appt of consultAppointments) ingestAppointment(appt, "consults");
  for (const appt of otherAppointments) ingestAppointment(appt, "appointments");

  for (const proc of sold) {
    const at = odStampToCursor(proc.DateTStamp);
    nextSold = laterCursor(nextSold, at);
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

  const sharedPatNums = patNumsByContact(state.contacts);
  const futureRows = await listOdFutureAppointmentsForPatients([
    ...new Set([...events.keys()].flatMap((patNum) => sharedPatNums(patNum))),
  ]);
  const futureByPatient = new Map<number, OdGhlFutureAppointmentRow[]>();
  for (const row of futureRows) {
    const list = futureByPatient.get(row.PatNum) ?? [];
    list.push(row);
    futureByPatient.set(row.PatNum, list);
  }

  // Procedure codes for future consult detection
  const futureAptNums = futureRows.map((r) => r.AptNum);
  if (futureAptNums.length > 0) {
    const futureCodes = await listOdAppointmentProcedureCodes(futureAptNums);
    for (const row of futureCodes) {
      const list = codesByApt.get(row.AptNum) ?? [];
      list.push(row.ProcCode);
      codesByApt.set(row.AptNum, list);
    }
  }

  let withFutureAppt = 0;
  let nurtureEligible = 0;
  for (const patNum of events.keys()) {
    const hasFuture = (futureByPatient.get(patNum) ?? []).length > 0;
    if (hasFuture) withFutureAppt += 1;
    else nurtureEligible += 1;
  }

  if (dryRun) {
    let wouldCreateContacts = 0;
    let wouldMatchExisting = 0;
    let wouldSkipUnclear = 0;
    if (events.size > 0) {
      const config = await getTexomaGhlConfigForSync();
      for (const patNum of events.keys()) {
        const row = patientsById.get(patNum) ?? null;
        const input = row ? patientContactInput(row) : null;
        if (!input) continue;
        const resolved = await resolveGhlContact(
          {
            patNum: input.patNum,
            phone: input.phone,
            email: input.email,
          },
          config,
        );
        if (resolved.kind === "found") wouldMatchExisting += 1;
        else if (resolved.kind === "unclear") wouldSkipUnclear += 1;
        else wouldCreateContacts += 1;
      }
    }
    return empty({
      patients: events.size,
      withFutureAppt,
      nurtureEligible,
      wouldCreateContacts,
      wouldMatchExisting,
      wouldSkipUnclear,
    });
  }

  requireLeadsNoShowStageConfig();

  const config = events.size > 0 ? await getTexomaGhlConfigForSync() : null;
  let upserted = 0;
  let tagged = 0;
  let cleared = 0;
  let unchanged = 0;
  let skippedNoContact = 0;
  let failed = 0;
  let appointmentsWritten = 0;

  for (const [patNum, list] of events) {
    const effect = foldTagEffects(
      [...list].sort((a, b) => a.at.localeCompare(b.at)).map((row) => row.effect),
    );
    const key = String(patNum);
    const previous = state.contacts[key] ?? null;
    const lines = linesByPatient.get(patNum) ?? [];
    const futureAppts = futureByPatient.get(patNum) ?? [];
    const contactFutureAppts = sharedPatNums(patNum)
      .flatMap((id) => futureByPatient.get(id) ?? [])
      .sort((a, b) =>
        String(a.AptDateTime ?? "").localeCompare(String(b.AptDateTime ?? "")),
      );
    const hasFutureAppt = futureAppts.length > 0;
    // Always process event patients so Text OK→DND and date fields refresh every run.
    const row = patientsById.get(patNum) ?? null;
    const input = row ? patientContactInput(row) : null;
    if (!config) continue;
    try {
      const outcome = await applyPatient({
        input,
        patientRow: row,
        effect,
        lines,
        previous,
        hasFutureAppt,
        futureAppts,
        contactFutureAppts,
        changedAppts: changedApptsByPatient.get(patNum) ?? [],
        codesByApt,
        config,
      });
      if (outcome.kind === "skipped") {
        skippedNoContact += 1;
        continue;
      }
      state.contacts[key] = outcome.link;
      appointmentsWritten += outcome.appointmentsWritten;
      if (outcome.upserted) upserted += 1;
      if (outcome.tagChange === "tagged") tagged += 1;
      else if (outcome.tagChange === "cleared") cleared += 1;
      else unchanged += 1;
    } catch (err) {
      failed += 1;
      const status = err instanceof GhlApiError ? ` (${err.status})` : "";
      const message = err instanceof Error ? err.message : "unknown";
      console.error(`GoHighLevel sync failed for PatNum ${patNum}${status}: ${message}`);
    }
  }

  let lastSuccessfulRunAt = state.lastSuccessfulRunAt ?? null;
  if (failed === 0) {
    if (wantPatients) state.cursors.patients = nextPatients;
    if (wantConsults) state.cursors.consults = nextConsults;
    if (wantOtherAppts) state.cursors.appointments = nextAppointments;
    if (wantSold) state.cursors.sold = nextSold;
    state.cursor = state.cursors.consults;
    lastSuccessfulRunAt = new Date().toISOString();
    state.lastSuccessfulRunAt = lastSuccessfulRunAt;
    if (config) {
      try {
        await upsertOdSyncLastSuccess(lastSuccessfulRunAt, config);
      } catch (err) {
        const message = err instanceof Error ? err.message : "unknown";
        console.error(`GoHighLevel sync heartbeat failed: ${message}`);
      }
    } else {
      // No patient events — still heartbeat when GHL is configured.
      try {
        const hbConfig = await getTexomaGhlConfigForSync();
        await upsertOdSyncLastSuccess(lastSuccessfulRunAt, hbConfig);
      } catch (err) {
        const message = err instanceof Error ? err.message : "unknown";
        console.error(`GoHighLevel sync heartbeat failed: ${message}`);
      }
    }
  }
  await writeOdGhlSyncState(state);

  return empty({
    patients: events.size,
    withFutureAppt,
    nurtureEligible,
    upserted,
    tagged,
    cleared,
    unchanged,
    skippedNoContact,
    failed,
    appointmentsWritten,
    lastSuccessfulRunAt,
  });
}

/** Exported for tests — Active Sequence values used by the sync. */
export const SYNC_ACTIVE_SEQUENCE = ACTIVE_SEQUENCE;

// Re-export for callers that still reference Central date helper.
export { toCentralYmd };
