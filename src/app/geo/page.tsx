import { AppShell } from "@/components/shell/AppShell";
import { GeoPageContent } from "@/components/geo/GeoPageContent";
import { EmptyState } from "@/components/ui/States";
import { loadGeoSummary } from "@/lib/warehouse/geo";
import { parsePeriodParams, periodLabel, periodToRange } from "@/lib/ui/period";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function GeoPage({ searchParams }: PageProps) {
  const period = parsePeriodParams(await searchParams);
  const range = periodToRange(period);
  const geo = await loadGeoSummary(range);
  const periodNote = periodLabel(period);

  if (!geo.available) {
    return (
      <AppShell
        title="Patients by Area"
        subtitle="Where your patients and production come from."
      >
        <EmptyState
          title="Unable to load geography"
          description={geo.notices[0] ?? "Patient warehouse unavailable."}
        />
      </AppShell>
    );
  }

  return (
    <AppShell
      title="Patients by Area"
      subtitle={`Where your patients and production come from · ${periodNote}`}
    >
      <GeoPageContent geo={geo} />
    </AppShell>
  );
}
