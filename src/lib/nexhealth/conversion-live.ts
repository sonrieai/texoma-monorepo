/**
 * Live NexHealth fetch + conversion summary (not used by Mongo warehouse pages).
 */

import "server-only";
import {
  listProcedures,
  listTreatmentPlans,
  type NexAppointment,
  type NexAppointmentType,
  type NexProcedure,
  type NexTreatmentPlan,
} from "@/lib/nexhealth/client";
import {
  summarizeConversion,
  type ConversionSummary,
} from "@/lib/nexhealth/conversion";

type Settled<T> = { ok: true; data: T } | { ok: false; error: string };

async function settle<T>(p: Promise<T>): Promise<Settled<T>> {
  try {
    return { ok: true, data: await p };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "request failed",
    };
  }
}

function nexTsToYmd(nexTs: string): string {
  return nexTs.slice(0, 10);
}

function nexTsToIso(nexTs: string): string {
  if (nexTs.endsWith("Z")) return nexTs;
  return nexTs.replace(/\+0000$/, "Z").replace(/([+-]\d{2})(\d{2})$/, "$1:$2");
}

export async function loadConversionSummary(params: {
  range: { start: string; end: string };
  appointments: NexAppointment[];
  appointmentTypes: NexAppointmentType[];
}): Promise<{
  summary: ConversionSummary;
  procedures: NexProcedure[];
  plans: NexTreatmentPlan[];
}> {
  const fromYmd = nexTsToYmd(params.range.start);
  const toYmd = nexTsToYmd(params.range.end);
  const updatedSince = nexTsToIso(params.range.start);

  const [plansR, proceduresR] = await Promise.all([
    settle(listTreatmentPlans({ updatedSince, maxPages: 5 })),
    settle(
      listProcedures({
        startedAfter: fromYmd,
        startedBefore: toYmd,
        maxPages: 5,
      }),
    ),
  ]);

  const extraNotices: string[] = [];
  if (!plansR.ok) extraNotices.push(`Treatment plans unavailable (${plansR.error}).`);
  else if (plansR.data.length === 0) {
    extraNotices.push("No treatment plans returned for this window.");
  }
  if (!proceduresR.ok) {
    extraNotices.push(`Procedures unavailable (${proceduresR.error}).`);
  }

  const summary = summarizeConversion({
    fromYmd,
    toYmd,
    appointments: params.appointments,
    appointmentTypes: params.appointmentTypes,
    procedures: proceduresR.ok ? proceduresR.data : [],
    plans: plansR.ok ? plansR.data : [],
  });
  summary.notices = [...extraNotices, ...summary.notices];
  return {
    summary,
    procedures: proceduresR.ok ? proceduresR.data : [],
    plans: plansR.ok ? plansR.data : [],
  };
}
