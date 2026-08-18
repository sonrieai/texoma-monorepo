import { loadLiveOverview, type LiveOverview } from "@/lib/nexhealth/live";

/** Thin adapter for /api/metrics/overview — warehouse (or live fallback) fields. */
export type OverviewMetrics = LiveOverview & {
  month: string;
  lastSyncedAt: string | null;
  live: {
    appointmentCount: number;
    showCount: number;
    noShowCount: number;
    cancelledCount: number;
    unknownAttendance: number;
    providerCount: number;
    grossProductionCents: number;
    collectionsCents: number;
    adjustmentsCents: number;
    netProductionCents: number;
  };
};

export async function getOverviewMetrics(
  start?: string,
  end?: string,
): Promise<OverviewMetrics> {
  const live = await loadLiveOverview(start, end);
  return {
    ...live,
    month: live.range.end.slice(0, 7),
    lastSyncedAt: live.lastSyncedAt ?? null,
    live: {
      appointmentCount: live.appointments.total,
      showCount: live.appointments.show,
      noShowCount: live.appointments.noShow,
      cancelledCount: live.appointments.cancelled,
      unknownAttendance: live.appointments.unknown,
      providerCount: live.providers.length,
      grossProductionCents: live.production.grossProductionCents,
      collectionsCents: live.production.collectionsCents,
      adjustmentsCents: live.production.adjustmentsCents,
      netProductionCents: live.production.netProductionCents,
    },
  };
}
