import { InsurancePageContent } from "@/components/analytics/InsurancePageContent";
import { AppShell } from "@/components/shell/AppShell";
import { EmptyState } from "@/components/ui/States";
import { loadLiveOverview } from "@/lib/warehouse/live";
import {
  parsePeriodParams,
  periodLabel,
  periodToRange,
} from "@/lib/ui/period";
import { practiceStatusBadge } from "@/lib/ui/practice-labels";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function InsurancePage({ searchParams }: PageProps) {
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
      <AppShell title="Insurance" subtitle="Live" badge="Error">
        <EmptyState
          title="Unable to load insurance metrics"
          description={error ?? "Dashboard data is unavailable. Try again shortly."}
        />
      </AppShell>
    );
  }

  return (
    <AppShell
      title="Insurance"
      subtitle="Claims, collections, AR, and SoonerCare reimbursement."
      badge={practiceStatusBadge({
        source: data.source,
        empty: data.warehouseEmpty,
        lastSyncedAt: data.lastSyncedAt,
      })}
    >
      <InsurancePageContent data={data} periodLabel={pl} />
    </AppShell>
  );
}
