import { notFound } from "next/navigation";
import { TcPageContent } from "@/components/analytics/TcPageContent";
import { DashboardFrame } from "@/components/shell/DashboardFrame";
import { EmptyState } from "@/components/ui/States";
import { listGhlOpportunitiesInRange } from "@/lib/ghl/opportunities";
import { loadLiveOverview } from "@/lib/warehouse/live";
import { coordinatorSlug } from "@/lib/tc/coordinators";
import {
  parsePeriodParams,
  periodLabel,
  periodToRange,
} from "@/lib/ui/period";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function TreatmentCoordinatorDetailPage({
  params,
  searchParams,
}: PageProps) {
  const { slug } = await params;
  const normalizedSlug = coordinatorSlug(slug);

  const period = parsePeriodParams(await searchParams);
  const range = periodToRange(period);
  const pl = periodLabel(period);
  void listGhlOpportunitiesInRange({
    startYmd: range.start.slice(0, 10),
    endYmd: range.end.slice(0, 10),
  });

  let data: Awaited<ReturnType<typeof loadLiveOverview>> | null = null;
  try {
    data = await loadLiveOverview(range.start, range.end);
  } catch {
    data = null;
  }

  if (!data) {
    return (
      <DashboardFrame title="Treatment coordinator" subtitle="Treatment coordinator metrics">
        <EmptyState
          title="Unable to load coordinator metrics"
          description="Dashboard data is unavailable. Try again shortly."
        />
      </DashboardFrame>
    );
  }

  const row =
    data.tcCoordinators.find((c) => c.slug === normalizedSlug) ?? null;
  if (!row) notFound();

  return (
    <DashboardFrame
      title={row.name}
      subtitle="Treatment coordinator metrics"
    >
      <TcPageContent
        data={data}
        periodLabel={pl}
        range={range}
        coordinator={row.coordinator}
        conv={row.conversion}
        tc={row.metrics}
        cockpitTag={row.name}
        journeySubtitle={`${row.name}'s own leads — from source through to paid production`}
      />
    </DashboardFrame>
  );
}
