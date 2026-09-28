import {
  TcCockpitMetrics,
  TcConversionFunnelSection,
  TcDenialReasonsSection,
  TcKeyFiguresSection,
  TcPatientJourneySection,
} from "@/components/analytics/TcDashboard";
import { loadGhlDeclineReasons } from "@/lib/ghl/decline-reasons";
import { isGhlConfigured, loadMarketingSummary } from "@/lib/ghl/client";
import {
  declineReasonTotal,
  mergeDeclineReasons,
} from "@/lib/tc/decline-reasons";
import type { ConversionSummary } from "@/lib/warehouse/conversion";
import type { LiveOverview } from "@/lib/warehouse/live";
import type { TcMetrics } from "@/lib/warehouse/tc-metrics";
import type { TcCoordinator } from "@/lib/tc/discover-coordinators";

type TcPageContentProps = {
  data: LiveOverview;
  periodLabel: string;
  range: { start: string; end: string };
  coordinator?: TcCoordinator;
  conv: ConversionSummary;
  tc: TcMetrics;
  cockpitTag: string;
  journeySubtitle: string;
};

export async function TcPageContent({
  data,
  periodLabel,
  range,
  coordinator,
  conv,
  tc,
  cockpitTag,
  journeySubtitle,
}: TcPageContentProps) {
  const startYmd = range.start.slice(0, 10);
  const endYmd = range.end.slice(0, 10);
  const ghlReady = await isGhlConfigured();
  const marketing = await loadMarketingSummary(
    { startYmd, endYmd },
    coordinator,
  );
  const ghlDeclines = await loadGhlDeclineReasons(
    { startYmd, endYmd },
    coordinator,
  );
  const declineReasons = mergeDeclineReasons(
    tc.declineReasons,
    ghlDeclines.reasons,
  );
  const declineTotal = declineReasonTotal(declineReasons);

  return (
    <>
      <TcCockpitMetrics
        conv={conv}
        tc={tc}
        appointments={data.appointments}
        productionAvailable={data.production.available}
        periodLabel={periodLabel}
        range={range}
        cockpitTag={cockpitTag}
      />
      <TcPatientJourneySection
        marketing={marketing}
        periodLabel={periodLabel}
        ghlReady={ghlReady}
        subtitle={journeySubtitle}
      />
      <TcConversionFunnelSection conv={conv} tc={tc} />
      <TcDenialReasonsSection
        declineReasons={declineReasons}
        declineTotal={declineTotal}
        ghlReady={ghlReady}
        periodLabel={periodLabel}
      />
      <TcKeyFiguresSection
        conv={conv}
        tc={tc}
        range={range}
        productionAvailable={data.production.available}
      />
    </>
  );
}
