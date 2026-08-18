import { AppShell } from "@/components/shell/AppShell";
import { CockpitMetrics } from "@/components/analytics/CockpitMetrics";
import {
  PaymentAndDentureSection,
  ProductionTrendSection,
  TreatmentByTypeSection,
} from "@/components/analytics/OverviewCharts";
import { EmptyState } from "@/components/ui/States";
import { loadLiveOverview } from "@/lib/nexhealth/live";
import {
  parsePeriodParams,
  periodToRange,
  treatmentChartSubtitle,
} from "@/lib/ui/period";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function OverviewPage({ searchParams }: PageProps) {
  const period = parsePeriodParams(await searchParams);
  const range = periodToRange(period);

  let error: string | null = null;
  let data: Awaited<ReturnType<typeof loadLiveOverview>> | null = null;

  try {
    data = await loadLiveOverview(range.start, range.end);
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to load dashboard data";
  }

  if (error || !data) {
    return (
      <AppShell title="Overview" subtitle="Practice KPIs">
        <EmptyState
          title="Unable to load dashboard"
          description="Dashboard data is unavailable. Try again shortly or contact your administrator."
        />
      </AppShell>
    );
  }

  const prod = data.production;

  return (
    <AppShell
      title="Overview"
      subtitle="Practice-wide cockpit, production, and payment mix."
    >
      <CockpitMetrics
        production={prod}
        accountsReceivable={data.accountsReceivable}
        conversion={data.conversion}
        range={data.range}
      />

      <TreatmentByTypeSection
        production={prod}
        subtitle={treatmentChartSubtitle(period)}
      />
      <PaymentAndDentureSection production={prod} />
      <ProductionTrendSection production={prod} />
    </AppShell>
  );
}
