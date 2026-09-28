import { AppShell } from "@/components/shell/AppShell";
import { HBarChart } from "@/components/charts/DonutChart";
import { DoctorProviderTable } from "@/components/providers/DoctorProviderTable";
import { Card, ComboStat, SectionHeading } from "@/components/ui/Cards";
import { EmptyState } from "@/components/ui/States";
import { providerCockpitCategoryCounts } from "@/lib/charts/cockpit-display-categories";
import { CHANNEL_COLORS } from "@/lib/types/viz";
import { centsToDollars, formatCount, formatPct } from "@/lib/metrics";
import { loadLiveOverview } from "@/lib/warehouse/live";
import type { LiveProviderRow } from "@/lib/warehouse/live";
import {
  parsePeriodParams,
  periodLabel,
  periodToRange,
} from "@/lib/ui/period";

export const dynamic = "force-dynamic";

const SAME_DAY_NP_TARGET = 0.3;

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function sortProvidersByProduction(
  providers: LiveProviderRow[],
): LiveProviderRow[] {
  return [...providers].sort(
    (a, b) =>
      b.production.grossProductionCents - a.production.grossProductionCents,
  );
}

function sumProviderVolume(
  providers: LiveProviderRow[],
  key: keyof LiveProviderRow["production"]["procedureVolume"],
): number {
  return providers.reduce((sum, p) => sum + p.production.procedureVolume[key], 0);
}

export default async function DoctorPage({ searchParams }: PageProps) {
  const period = parsePeriodParams(await searchParams);
  const range = periodToRange(period);
  const pl = periodLabel(period);

  let error: string | null = null;
  let data: Awaited<ReturnType<typeof loadLiveOverview>> | null = null;
  try {
    data = await loadLiveOverview(range.start, range.end);
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to load providers";
  }

  if (error || !data) {
    return (
      <AppShell
        title="Doctor"
        subtitle="Clinical productivity and surgical volume by provider."
      >
        <EmptyState
          title="Unable to load providers"
          description="Dashboard data is unavailable. Try again shortly or contact your administrator."
        />
      </AppShell>
    );
  }

  const providers = sortProvidersByProduction(data.providers);
  const hasProviders = providers.length > 0;
  const prodAvailable = data.production.available;

  const totalImplants = sumProviderVolume(providers, "implants");
  const totalArches = sumProviderVolume(providers, "aox");
  const totalDentures = sumProviderVolume(providers, "dentures");
  const totalRemakes = sumProviderVolume(providers, "remakes");
  const totalNpSeen = providers.reduce((s, p) => s + p.npConsultShow, 0);
  const totalSameDayNp = providers.reduce((s, p) => s + p.sameDayNp, 0);
  const sameDayNpRate =
    totalNpSeen > 0 ? totalSameDayNp / totalNpSeen : null;
  const remakeRate = totalDentures > 0 ? totalRemakes / totalDentures : null;

  const tableRows = providers.map((p) => ({
    id: p.id,
    name: p.name,
    grossProductionCents: p.production.grossProductionCents,
    categoryCounts: providerCockpitCategoryCounts(
      p.production.productionByCategory,
      p.production.procedureVolume,
    ),
    arches: p.production.procedureVolume.aox,
    npConsultShow: p.npConsultShow,
    sameDayNp: p.sameDayNp,
  }));

  const providerBars = providers.map((p, i) => ({
    label: p.name,
    value: centsToDollars(p.production.grossProductionCents),
    color: CHANNEL_COLORS[i % CHANNEL_COLORS.length],
  }));

  const surgicalBars = providers.map((p, i) => ({
    label: p.name,
    value: p.production.procedureVolume.implants,
    color: CHANNEL_COLORS[i % CHANNEL_COLORS.length],
  }));

  return (
    <AppShell
      title="Doctor"
      subtitle="Clinical productivity and surgical volume by provider."
    >
      <div className="mb-1.5 grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <ComboStat
          size="lg"
          label="Implants placed"
          value={formatCount(totalImplants, prodAvailable)}
          note={pl}
          status={totalImplants > 0 ? "good" : undefined}
        />
        <ComboStat
          size="lg"
          label="Full-arch cases"
          value={formatCount(totalArches, prodAvailable)}
          note={`All-on-X · ${pl}`}
          status={totalArches > 0 ? "good" : undefined}
        />
        <ComboStat
          size="lg"
          label="New patients seen"
          value={String(totalNpSeen)}
          note={`across providers · ${pl}`}
        />
        <ComboStat
          size="lg"
          label="Same-day NP conversion"
          value={sameDayNpRate != null ? formatPct(sameDayNpRate) : "—"}
          target="≥30%"
          status={
            sameDayNpRate == null
              ? "neutral"
              : sameDayNpRate >= SAME_DAY_NP_TARGET
                ? "good"
                : sameDayNpRate >= 0.2
                  ? "warn"
                  : "bad"
          }
        />
        <ComboStat
          size="lg"
          label="Denture remakes"
          value={formatCount(totalRemakes, prodAvailable)}
          note={
            remakeRate != null
              ? `${formatPct(remakeRate)} of dentures · ${pl}`
              : pl
          }
          status={
            !prodAvailable || remakeRate == null
              ? "neutral"
              : remakeRate <= 0.05
                ? "good"
                : remakeRate <= 0.1
                  ? "warn"
                  : "bad"
          }
        />
      </div>

      <SectionHeading title="By Provider" />
      {!hasProviders ? (
        <EmptyState
          title="No providers"
          description="No providers found for this location."
        />
      ) : (
        <div className="mb-4">
          <DoctorProviderTable
            providers={tableRows}
            productionAvailable={prodAvailable}
          />
        </div>
      )}

      {hasProviders ? (
        <>
          <SectionHeading title="Provider Production" />
          <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-2">
            <Card title="Production" className="min-w-0">
              <HBarChart rows={providerBars} money />
            </Card>
            <Card title="Surgical Volume" subtitle="Implants by provider" className="min-w-0">
              <HBarChart rows={surgicalBars} money={false} />
            </Card>
          </div>
        </>
      ) : null}
    </AppShell>
  );
}
