import { cache } from "react";
import { isExcludedDoctorProvider } from "@/lib/warehouse/excluded-doctor-providers";
import type { AppointmentTypeMixRow } from "@/lib/warehouse/appointment-mix";
import type { ConversionSummary } from "@/lib/warehouse/conversion";
import type { ArSummary } from "@/lib/warehouse/ar";
import type { InsuranceMetrics } from "@/lib/warehouse/insurance-metrics";
import type { AppointmentRecord } from "@/lib/warehouse/types";
import type {
  CategoryProductionRow,
  DentureWarrantyMix,
  MonthlyCollectionPoint,
  MonthlyProductionSeries,
  PeriodTrendPoint,
  ProcedureMixRow,
  ProcedureVolume,
  ProviderProduction,
  TreatmentByMonthRow,
} from "@/lib/warehouse/production";
import type { PaymentMix, FinancingVendorMix } from "@/lib/warehouse/payment-mix";
import type { TcMetrics } from "@/lib/warehouse/tc-metrics";
import type { TcCoordinatorRow } from "@/lib/tc/coordinator-metrics";

export type LiveProviderRow = {
  id: string;
  sourceId: number;
  name: string;
  appointmentCount: number;
  showCount: number;
  noShowCount: number;
  cancelledCount: number;
  unknownCount: number;
  upcomingCount: number;
  /** NP consult shows (when type IDs configured). */
  npConsultShow: number;
  /** Consult show with more than $250 collected the same day for this provider. */
  sameDayNp: number;
  /** SoonerCare NP consult shows (appointment text / type). */
  scNpSeen: number;
  /** Consult shows that closed on a later day (not same-day). */
  npClosedDeferred: number;
  /** Visit mix for this provider only (PHI-safe counts). */
  appointmentTypes: AppointmentTypeMixRow[];
  /** Ledger / procedure production for this provider. */
  production: ProviderProduction;
};

export type ProcedureCategory = {
  procCatId: number;
  name: string;
  hidden: boolean;
};

export type LiveProduction = {
  available: boolean;
  grossProductionCents: number;
  /** Gross production for SoonerCare patients or SC chart codes (not payment mix). */
  scProductionCents: number;
  collectionsCents: number;
  adjustmentsCents: number;
  netProductionCents: number;
  procedureCount: number;
  chargeCount: number;
  paymentCount: number;
  adjustmentCount: number;
  procedureMix: ProcedureMixRow[];
  productionByCategory: CategoryProductionRow[];
  /** Open Dental categories synced from source (ProcCat). */
  procedureCategories: ProcedureCategory[];
  procedureVolume: ProcedureVolume;
  collectionRatio: number | null;
  uncategorizedProductionCents: number;
  unmappedCodes: ProcedureMixRow[];
  paymentMix: PaymentMix;
  financingVendorMix: FinancingVendorMix;
  monthlyProduction: MonthlyProductionSeries[];
  periodTrend: PeriodTrendPoint[];
  treatmentByMonth: TreatmentByMonthRow[];
  dentureWarranty: DentureWarrantyMix;
  partialWarranty: DentureWarrantyMix;
  monthlyCollections: MonthlyCollectionPoint[];
};

export type LiveOverview = {
  source: "opendental";
  locationId: number;
  subdomain: string;
  locationName: string | null;
  range: { start: string; end: string };
  notices: string[];
  providers: LiveProviderRow[];
  appointments: {
    total: number;
    show: number;
    noShow: number;
    cancelled: number;
    unknown: number;
    upcoming: number;
    past: number;
  };
  showRate: number;
  /** Practice-wide visit mix by appointment type. */
  appointmentTypes: AppointmentTypeMixRow[];
  production: LiveProduction;
  conversion: ConversionSummary;
  tcMetrics: TcMetrics;
  tcCoordinators: TcCoordinatorRow[];
  accountsReceivable: ArSummary;
  insurance: InsuranceMetrics;
  lastSyncedAt: string | null;
  warehouseEmpty: boolean;
};

/** Dashboard overview — live Open Dental MySQL. */
const OVERVIEW_CACHE_LIMIT = 8;
type OverviewCache = Map<string, { loadedAt: string; overview: LiveOverview }>;
const overviewCache: OverviewCache = ((
  globalThis as { __texomaOverviewCache?: OverviewCache }
).__texomaOverviewCache ??= new Map());

export const loadLiveOverview = cache(
  async (start?: string, end?: string): Promise<LiveOverview> => {
    const { loadOpenDentalSnapshot } = await import(
      "@/lib/opendental/snapshot"
    );
    const { buildOverviewFromSnapshot, defaultOverviewRange } = await import(
      "@/lib/warehouse/build-overview"
    );
    const snapshot = await loadOpenDentalSnapshot();
    const range = start && end ? { start, end } : defaultOverviewRange();
    const key = `${snapshot.loadedAt}|${range.start}|${range.end}`;
    const hit = overviewCache.get(key);
    if (hit) return hit.overview;

    const overview = buildOverviewFromSnapshot(snapshot, range);
    if (overviewCache.size >= OVERVIEW_CACHE_LIMIT) {
      const oldest = overviewCache.keys().next().value;
      if (oldest) overviewCache.delete(oldest);
    }
    overviewCache.set(key, { loadedAt: snapshot.loadedAt, overview });
    return overview;
  },
);

export async function loadLiveProviders(): Promise<
  { id: string; name: string }[]
> {
  const { loadOpenDentalSnapshot } = await import(
    "@/lib/opendental/snapshot"
  );
  const snapshot = await loadOpenDentalSnapshot();
  return snapshot.providers
    .filter(
      (provider) =>
        !provider.inactive &&
        !isExcludedDoctorProvider(provider.name ?? ""),
    )
    .map((provider) => ({
      id: String(provider.id),
      name: provider.name ?? `Provider ${provider.id}`,
    }));
}

export type { AppointmentRecord };
export type { AppointmentTypeMixRow };
