import { notFound } from "next/navigation";
import {
  DoctorCockpitMetrics,
  DoctorProductionTrendSection,
} from "@/components/analytics/DoctorCockpitMetrics";
import { AppShell } from "@/components/shell/AppShell";
import { EmptyState } from "@/components/ui/States";
import { loadLiveOverview } from "@/lib/warehouse/live";
import {
  parsePeriodParams,
  periodLabel,
  periodToRange,
} from "@/lib/ui/period";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function DoctorDetailPage({ params, searchParams }: Props) {
  const { id } = await params;
  const period = parsePeriodParams(await searchParams);
  const range = periodToRange(period);
  const pl = periodLabel(period);

  let data: Awaited<ReturnType<typeof loadLiveOverview>> | null = null;
  try {
    data = await loadLiveOverview(range.start, range.end);
  } catch {
    data = null;
  }

  if (!data) {
    return (
      <AppShell
        title="Doctor"
        subtitle="Provider metrics & production"
      >
        <EmptyState
          title="Unable to load provider"
          description="Dashboard data is unavailable. Try again shortly or contact your administrator."
        />
      </AppShell>
    );
  }

  const provider = data.providers.find((p) => p.id === id);
  if (!provider) notFound();

  return (
    <AppShell title={provider.name} subtitle="Provider metrics & production">
      <DoctorCockpitMetrics
        provider={provider}
        periodLabel={pl}
        productionAvailable={data.production.available}
      />
      <DoctorProductionTrendSection
        providerName={provider.name}
        monthlyProduction={provider.production.monthlyProduction}
      />
    </AppShell>
  );
}
