import {
  startTcGhlLoad,
  TcPageContent,
} from "@/components/analytics/TcPageContent";
import { DashboardFrame } from "@/components/shell/DashboardFrame";
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
  const ghlPromise = startTcGhlLoad(range);

  let error: string | null = null;
  let data: Awaited<ReturnType<typeof loadLiveOverview>> | null = null;

  try {
    data = await loadLiveOverview(range.start, range.end);
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to load data";
  }

  if (error || !data) {
    return (
      <DashboardFrame
        title="Treatment Coordinator"
        subtitle="Treatment acceptance and the funnel."
      >
        <EmptyState
          title="Unable to load TC metrics"
          description="Dashboard data is unavailable. Try again shortly."
        />
      </DashboardFrame>
    );
  }

  return (
    <DashboardFrame
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
        ghl={await ghlPromise}
      />
    </DashboardFrame>
  );
}
