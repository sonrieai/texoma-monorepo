import { TcPageContent } from "@/components/analytics/TcPageContent";
import { AppShell } from "@/components/shell/AppShell";
import { EmptyState } from "@/components/ui/States";
import { loadLiveOverview } from "@/lib/warehouse/live";
import {
  parsePeriodParams,
  periodLabel,
  periodToRange,
} from "@/lib/ui/period";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function TreatmentCoordinatorPage({
  searchParams,
}: PageProps) {
  const period = parsePeriodParams(await searchParams);
  const range = periodToRange(period);
  const pl = periodLabel(period);

  let error: string | null = null;
  let data: Awaited<ReturnType<typeof loadLiveOverview>> | null = null;

  try {
    data = await loadLiveOverview(range.start, range.end);
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to load data";
  }

  if (error || !data) {
    return (
      <AppShell
        title="Treatment Coordinator"
        subtitle="Treatment acceptance and the funnel."
      >
        <EmptyState
          title="Unable to load TC metrics"
          description="Dashboard data is unavailable. Try again shortly."
        />
      </AppShell>
    );
  }

  return (
    <AppShell
      title="Treatment Coordinator"
      subtitle="Treatment acceptance and the funnel."
    >
      <TcPageContent
        data={data}
        periodLabel={pl}
        range={range}
        conv={data.conversion}
        tc={data.tcMetrics}
        cockpitTag="treatment coordinator"
        journeySubtitle="Where patients come from and how they move through to paid production"
      />
    </AppShell>
  );
}
