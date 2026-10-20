/**
 * Marketing funnel from Open Dental referrals, with GoHighLevel filling gaps.
 * Spend and lead response time stay on GoHighLevel.
 */

import type { CdtLookup } from "@/lib/cdt/categories";
import type {
  AdChannel,
  MarketingScoreItem,
  MarketingSummary,
  ReferralSourceRow,
} from "@/lib/ghl/marketing";
import { formatResponseMinutes } from "@/lib/ghl/response-time";
import { safeRate } from "@/lib/metrics";
import {
  inYmdRange,
  mapConversionAttendance,
} from "@/lib/warehouse/conversion";
import {
  isProcedureComplete,
  procedurePatientId,
  procedureYmd,
} from "@/lib/warehouse/procedure-status";
import {
  moneyToCents,
  type AppointmentRecord,
  type ProcedureRecord,
} from "@/lib/warehouse/types";

export type ReferralAttach = {
  patientId: number;
  refDate: string | null;
  itemOrder: number;
  attachId: number;
  lastName: string;
  firstName: string;
};

export type MarketingFunnelSource = "opendental" | "gohighlevel" | "both";

const PATIENT_REFERRAL = "Patient referral";
const UNKNOWN_SOURCE = "Unknown";

const GOALS = {
  costPerArch: 700,
  showRate: 0.75,
  acceptance: 0.6,
  responseMin: 5,
  roi: 10,
};

export function referralSourceLabel(
  lastName: string | null | undefined,
  firstName: string | null | undefined,
): string {
  const last = (lastName ?? "").trim();
  const first = (firstName ?? "").trim();
  if (first) return PATIENT_REFERRAL;
  if (!last) return UNKNOWN_SOURCE;
  return last;
}

function attachRank(row: ReferralAttach): [string, number, number] {
  return [row.refDate ?? "9999-99-99", row.itemOrder, row.attachId];
}

function earlierAttach(a: ReferralAttach, b: ReferralAttach): ReferralAttach {
  const [aDate, aOrder, aId] = attachRank(a);
  const [bDate, bOrder, bId] = attachRank(b);
  if (aDate !== bDate) return aDate < bDate ? a : b;
  if (aOrder !== bOrder) return aOrder < bOrder ? a : b;
  return aId <= bId ? a : b;
}

/** One source per patient: earliest ref date, then item order, then attach id. */
export function sourceByPatient(rows: ReferralAttach[]): Map<number, string> {
  const chosen = new Map<number, ReferralAttach>();
  for (const row of rows) {
    if (!Number.isFinite(row.patientId)) continue;
    const prev = chosen.get(row.patientId);
    chosen.set(row.patientId, prev ? earlierAttach(prev, row) : row);
  }
  const labels = new Map<number, string>();
  for (const [patientId, row] of chosen) {
    labels.set(patientId, referralSourceLabel(row.lastName, row.firstName));
  }
  return labels;
}

function emptyChannel(name: string): AdChannel {
  return {
    name,
    spend: 0,
    leads: 0,
    booked: 0,
    showed: 0,
    accepted: 0,
    surgery: 0,
    production: 0,
  };
}

function rangeLookbackDays(startYmd: string, endYmd: string): number {
  const start = new Date(`${startYmd}T12:00:00Z`).getTime();
  const end = new Date(`${endYmd}T12:00:00Z`).getTime();
  const days = Math.max(1, Math.round((end - start) / 86400000) + 1);
  return Math.min(days, 365);
}

function isAoxSold(code: string | null | undefined, cdt: CdtLookup): boolean {
  if (cdt.isAoxSoldCode(code)) return true;
  const normalized = (code ?? "").trim().toUpperCase();
  return normalized === "U-AOXS" || normalized === "U-AOXD";
}

function scorecard(params: {
  showRate: number | null;
  acceptanceRate: number | null;
  roi: number | null;
  costPerArch: number | null;
  responseMinutes: number | null;
}): MarketingScoreItem[] {
  const { showRate, acceptanceRate, roi, costPerArch, responseMinutes } = params;
  return [
    {
      label: "Cost per arch",
      show: costPerArch != null ? `$${Math.round(costPerArch)}` : "—",
      goal: `< $${GOALS.costPerArch}`,
      pass: costPerArch == null ? null : costPerArch < GOALS.costPerArch,
    },
    {
      label: "Show rate",
      show: showRate != null ? `${Math.round(showRate * 1000) / 10}%` : "—",
      goal: `> ${Math.round(GOALS.showRate * 100)}%`,
      pass: showRate == null ? null : showRate > GOALS.showRate,
    },
    {
      label: "Treatment acceptance",
      show:
        acceptanceRate != null
          ? `${Math.round(acceptanceRate * 1000) / 10}%`
          : "—",
      goal: `> ${Math.round(GOALS.acceptance * 100)}%`,
      pass: acceptanceRate == null ? null : acceptanceRate > GOALS.acceptance,
    },
    {
      label: "Lead response time",
      show: responseMinutes != null ? formatResponseMinutes(responseMinutes) : "—",
      goal: `< ${GOALS.responseMin} min`,
      pass:
        responseMinutes == null ? null : responseMinutes < GOALS.responseMin,
    },
    {
      label: "Marketing ROI",
      show: roi != null ? `${roi.toFixed(1)}x` : "—",
      goal: `> ${GOALS.roi}x`,
      pass: roi == null ? null : roi > GOALS.roi,
    },
  ];
}

export function assembleMarketingSummary(params: {
  channels: AdChannel[];
  notices: string[];
  lookbackDays: number;
  showRate: number | null;
  responseMinutes: number | null;
  opportunityCount: number;
}): MarketingSummary {
  const channels = [...params.channels].sort(
    (a, b) =>
      b.spend - a.spend || b.production - a.production || b.leads - a.leads,
  );
  const totals = channels.reduce(
    (acc, channel) => {
      acc.leads += channel.leads;
      acc.booked += channel.booked;
      acc.showed += channel.showed;
      acc.accepted += channel.accepted;
      acc.surgery += channel.surgery;
      acc.production += channel.production;
      acc.spend += channel.spend;
      return acc;
    },
    {
      leads: 0,
      booked: 0,
      showed: 0,
      accepted: 0,
      surgery: 0,
      production: 0,
      spend: 0,
    },
  );
  const computedShow =
    totals.booked > 0 ? safeRate(totals.showed, totals.booked) : null;
  const showRate = params.showRate ?? computedShow;
  const acceptanceRate =
    totals.showed > 0 ? safeRate(totals.accepted, totals.showed) : null;
  const costPerLead =
    totals.spend > 0 && totals.leads > 0 ? totals.spend / totals.leads : null;
  const costPerArch =
    totals.spend > 0 && totals.surgery > 0
      ? totals.spend / totals.surgery
      : null;
  const roi = totals.spend > 0 ? totals.production / totals.spend : null;
  const referralSources: ReferralSourceRow[] = channels.map((channel) => ({
    source: channel.name,
    newPatients: channel.showed > 0 ? channel.showed : channel.leads,
    production: channel.production,
  }));
  const available = params.opportunityCount > 0 || channels.length > 0;
  return {
    available,
    notices: params.notices,
    channels,
    referralSources,
    totals,
    roi,
    costPerArch,
    costPerLead,
    showRate,
    acceptanceRate,
    scorecard: scorecard({
      showRate,
      acceptanceRate,
      roi,
      costPerArch,
      responseMinutes: params.responseMinutes,
    }),
    opportunityCount: params.opportunityCount,
    lookbackDays: params.lookbackDays,
    responseMinutes: params.responseMinutes,
  };
}

export function emptyMarketingSummary(notices: string[] = []): MarketingSummary {
  return assembleMarketingSummary({
    channels: [],
    notices,
    lookbackDays: 0,
    showRate: null,
    responseMinutes: null,
    opportunityCount: 0,
  });
}

export function summarizeOdMarketing(params: {
  fromYmd: string;
  toYmd: string;
  referrals: ReferralAttach[];
  patients: Array<{ patientId: number; dateFirstVisit: string | null }>;
  appointments: AppointmentRecord[];
  procedures: ProcedureRecord[];
  cdt: CdtLookup;
  appointmentsLoadedFromYmd: string;
  consultShowRate?: number | null;
}): MarketingSummary {
  const notices: string[] = [];
  if (
    params.fromYmd < params.appointmentsLoadedFromYmd &&
    params.appointmentsLoadedFromYmd
  ) {
    notices.push(
      `Booked and showed visits are loaded from ${params.appointmentsLoadedFromYmd}. Earlier appointments in this period are not on the chart.`,
    );
  }

  const sourceOf = sourceByPatient(params.referrals);
  const channels = new Map<string, AdChannel>();
  const ensure = (name: string) => {
    const existing = channels.get(name);
    if (existing) return existing;
    const created = emptyChannel(name);
    channels.set(name, created);
    return created;
  };

  const newPatientIds = new Set<number>();
  for (const patient of params.patients) {
    if (!inYmdRange(patient.dateFirstVisit, params.fromYmd, params.toYmd)) {
      continue;
    }
    newPatientIds.add(patient.patientId);
    const source = sourceOf.get(patient.patientId) ?? UNKNOWN_SOURCE;
    ensure(source).leads += 1;
  }

  const booked = new Set<number>();
  const showed = new Set<number>();
  for (const appt of params.appointments) {
    const patientId = appt.patient_id;
    if (typeof patientId !== "number" || !newPatientIds.has(patientId)) continue;
    if (!inYmdRange(appt.start_time, params.fromYmd, params.toYmd)) continue;
    const attendance = mapConversionAttendance(appt);
    if (attendance !== "cancelled") booked.add(patientId);
    if (attendance === "show") showed.add(patientId);
  }

  const accepted = new Set<number>();
  const surgery = new Set<number>();
  for (const proc of params.procedures) {
    if (!isProcedureComplete(proc.status)) continue;
    const ymd = procedureYmd(proc);
    if (!inYmdRange(ymd, params.fromYmd, params.toYmd)) continue;
    const patientId = procedurePatientId(proc);
    if (patientId == null) continue;
    const dollars = moneyToCents(proc.fee) / 100;
    const source = sourceOf.get(patientId) ?? UNKNOWN_SOURCE;
    if (dollars !== 0) ensure(source).production += dollars;
    if (!newPatientIds.has(patientId)) continue;
    if (isAoxSold(proc.code, params.cdt)) surgery.add(patientId);
    if (showed.has(patientId) && !params.cdt.isConsultCode(proc.code)) {
      accepted.add(patientId);
    }
  }

  for (const patientId of booked) {
    const source = sourceOf.get(patientId) ?? UNKNOWN_SOURCE;
    ensure(source).booked += 1;
  }
  for (const patientId of showed) {
    const source = sourceOf.get(patientId) ?? UNKNOWN_SOURCE;
    ensure(source).showed += 1;
  }
  for (const patientId of accepted) {
    const source = sourceOf.get(patientId) ?? UNKNOWN_SOURCE;
    ensure(source).accepted += 1;
  }
  for (const patientId of surgery) {
    const source = sourceOf.get(patientId) ?? UNKNOWN_SOURCE;
    ensure(source).surgery += 1;
  }

  const rows = [...channels.values()].filter(
    (channel) =>
      channel.leads > 0 ||
      channel.booked > 0 ||
      channel.showed > 0 ||
      channel.accepted > 0 ||
      channel.surgery > 0 ||
      channel.production !== 0,
  );
  return assembleMarketingSummary({
    channels: rows,
    notices,
    lookbackDays: rangeLookbackDays(params.fromYmd, params.toYmd),
    showRate: params.consultShowRate ?? null,
    responseMinutes: null,
    opportunityCount: newPatientIds.size,
  });
}

/** Named Open Dental sources, not the Unknown bucket. */
export function openDentalHasReferrals(summary: MarketingSummary): boolean {
  return summary.channels.some(
    (channel) =>
      channel.name !== UNKNOWN_SOURCE &&
      (channel.leads > 0 || channel.production !== 0),
  );
}

function alignKey(name: string): string {
  const lower = name.trim().toLowerCase();
  if (lower.includes("google")) return "google";
  if (/facebook|instagram|\bmeta\b|\bfb\b/.test(lower)) return "facebook";
  return lower;
}

function addCounts(into: AdChannel, from: AdChannel): void {
  into.leads += from.leads;
  into.booked += from.booked;
  into.showed += from.showed;
  into.accepted += from.accepted;
  into.surgery += from.surgery;
  into.production += from.production;
  into.spend += from.spend;
}

type MergeBucket = {
  odName: string | null;
  ghlNames: string[];
  od: AdChannel | null;
  ghl: AdChannel | null;
};

function bucketDisplayName(bucket: MergeBucket, useOd: boolean): string {
  if (useOd && bucket.odName) return bucket.odName;
  if (bucket.ghlNames.length > 1 && alignKey(bucket.ghlNames[0] ?? "") === "facebook") {
    return "Facebook or Instagram";
  }
  return bucket.ghlNames[0] ?? bucket.odName ?? UNKNOWN_SOURCE;
}

const GHL_CONNECT_NOTICE =
  "Connect GoHighLevel in Settings to show live funnel and referral sources.";

export function mergeMarketingSources(params: {
  openDental: MarketingSummary;
  goHighLevel: MarketingSummary;
  consultShowRate: number | null;
}): { summary: MarketingSummary; funnelSource: MarketingFunnelSource } {
  const odReady = openDentalHasReferrals(params.openDental);
  const ghlReady =
    params.goHighLevel.available && params.goHighLevel.channels.length > 0;
  const showRate = params.consultShowRate ?? null;
  const responseMinutes = params.goHighLevel.responseMinutes;

  if (!odReady) {
    if (ghlReady) {
      const summary = assembleMarketingSummary({
        channels: params.goHighLevel.channels,
        notices: params.goHighLevel.notices,
        lookbackDays: params.goHighLevel.lookbackDays,
        showRate,
        responseMinutes,
        opportunityCount: params.goHighLevel.opportunityCount,
      });
      return {
        summary,
        funnelSource: showRate != null ? "both" : "gohighlevel",
      };
    }
    const summary = assembleMarketingSummary({
      channels: params.openDental.channels,
      notices: params.openDental.notices,
      lookbackDays: params.openDental.lookbackDays,
      showRate,
      responseMinutes,
      opportunityCount: params.openDental.opportunityCount,
    });
    return { summary, funnelSource: "opendental" };
  }

  const buckets = new Map<string, MergeBucket>();
  const ensureBucket = (key: string): MergeBucket => {
    const existing = buckets.get(key);
    if (existing) return existing;
    const created: MergeBucket = {
      odName: null,
      ghlNames: [],
      od: null,
      ghl: null,
    };
    buckets.set(key, created);
    return created;
  };

  for (const channel of params.openDental.channels) {
    const bucket = ensureBucket(alignKey(channel.name));
    bucket.odName = bucket.odName ?? channel.name;
    if (!bucket.od) bucket.od = emptyChannel(channel.name);
    addCounts(bucket.od, channel);
  }
  for (const channel of params.goHighLevel.channels) {
    const bucket = ensureBucket(alignKey(channel.name));
    if (!bucket.ghlNames.includes(channel.name)) bucket.ghlNames.push(channel.name);
    if (!bucket.ghl) bucket.ghl = emptyChannel(channel.name);
    addCounts(bucket.ghl, channel);
  }

  let usedGhlCounts = false;
  const merged: AdChannel[] = [];
  for (const bucket of buckets.values()) {
    const odActive =
      bucket.od != null && (bucket.od.leads > 0 || bucket.od.production !== 0);
    const counts = odActive ? bucket.od : bucket.ghl;
    if (!counts && !bucket.ghl?.spend) continue;
    if (!odActive && bucket.ghl && (bucket.ghl.leads > 0 || bucket.ghl.production !== 0)) {
      usedGhlCounts = true;
    }
    const name = bucketDisplayName(bucket, odActive);
    const row = emptyChannel(name);
    if (counts) addCounts(row, counts);
    row.spend = bucket.ghl?.spend ?? 0;
    if (!odActive) row.production = bucket.ghl?.production ?? row.production;
    merged.push(row);
  }

  const ghlNotices = params.goHighLevel.notices.filter(
    (notice) => notice !== GHL_CONNECT_NOTICE,
  );
  const spendFromGhl = merged.some((channel) => channel.spend > 0);
  const summary = assembleMarketingSummary({
    channels: merged,
    notices: [...params.openDental.notices, ...ghlNotices],
    lookbackDays: params.openDental.lookbackDays || params.goHighLevel.lookbackDays,
    showRate,
    responseMinutes,
    opportunityCount: params.openDental.opportunityCount,
  });
  return {
    summary,
    funnelSource: usedGhlCounts || spendFromGhl ? "both" : "opendental",
  };
}
