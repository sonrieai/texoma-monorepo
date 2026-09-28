import { AppShell } from "@/components/shell/AppShell";
import { GeoPageContent } from "@/components/geo/GeoPageContent";
import { EmptyState } from "@/components/ui/States";
import { loadGeoSummary } from "@/lib/warehouse/geo";

export const dynamic = "force-dynamic";

export default async function GeoPage() {
  const geo = await loadGeoSummary();

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
      subtitle="Where your patients and production come from."
    >
      <GeoPageContent geo={geo} />
    </AppShell>
  );
}
