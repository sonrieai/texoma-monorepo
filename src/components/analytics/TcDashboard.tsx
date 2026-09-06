import type { ReactNode } from "react";
import Link from "next/link";
import { FunnelChart } from "@/components/charts/FunnelChart";
import { DonutChart, HBarChart } from "@/components/charts/DonutChart";
import { PatientJourneyTable } from "@/components/analytics/PatientJourneyTable";
import { Card, ComboStat, SectionHeading } from "@/components/ui/Cards";
import { KeyFiguresTable } from "@/components/ui/KeyFiguresTable";
import { EmptyState } from "@/components/ui/States";
import type { MarketingSummary } from "@/lib/ghl/marketing";
import {
  centsToDollars,
  formatPct,
  formatUsd,
} from "@/lib/metrics";
import type { ConversionSummary } from "@/lib/nexhealth/conversion";
import type { LiveOverview } from "@/lib/nexhealth/live";
import type { TcMetrics } from "@/lib/nexhealth/tc-metrics";
import type { DeclineReasonRow } from "@/lib/tc/decline-reasons";
import { CHANNEL_COLORS } from "@/lib/types/viz";

const SAME_DAY_NP_TC_TARGET = 0.75;
const TX_CLOSE_TARGET_LOW = 0.6;
const TX_CLOSE_TARGET_HIGH = 0.75;
const IMPLANT_ACCEPT_TARGET = 0.6;

function TcComboStack({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <Card title={title} className="h-full">
      <div className="mt-1 grid grid-cols-1 gap-2.5 sm:grid-cols-2">{children}</div>
    </Card>
  );
}

function conversionsPerWeek(
  count: number,
  range: { start: string; end: string },
): string {
  const start = new Date(range.start.slice(0, 10));
  const end = new Date(range.end.slice(0, 10));
  const days =
    Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1);
  const weeks = Math.max(days / 7, 1);
  return String(Math.round(count / weeks));
}

function pctOrDash(rate: number | null | undefined): string {
  return rate != null ? formatPct(rate) : "—";
}

export function TcCockpitMetrics({
  conv,
  tc,
  appointments,
  productionAvailable,
  periodLabel,
  range,
  cockpitTag = "treatment coordinator",
}: {
  conv: ConversionSummary;
  tc: TcMetrics;
  appointments: LiveOverview["appointments"];
  productionAvailable: boolean;
  periodLabel: string;
  range: { start: string; end: string };
  cockpitTag?: string;
}) {
  const noShowDenom = appointments.show + appointments.noShow;
  const noShowRate = noShowDenom > 0 ? appointments.noShow / noShowDenom : null;
  const presented = tc.tpPresentedCount;
  const accepted = tc.tpAcceptedCount;
  const acceptPct =
    presented > 0 ? accepted / presented : null;
  const financedTotal = centsToDollars(tc.financingVendorMix.totalCents);
  const finSlices = tc.financingDonutSlices;

  return (
    <>
      <SectionHeading title="Cockpit Metrics" tag={cockpitTag} />
      <div className="mb-1.5 grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
        <TcComboStack title="New Patients">
          <ComboStat
            variant="inset"
            label="NP's Scheduled"
            value={String(conv.npConsultBooked)}
            note={periodLabel}
          />
          <ComboStat
            variant="inset"
            label="NP's Seen"
            value={String(conv.npConsultShow)}
            note={periodLabel}
          />
          <ComboStat
            variant="inset"
            label="SC NP's"
            value={tc.scNpSeen > 0 ? String(tc.scNpSeen) : "—"}
            note="SoonerCare"
          />
          <ComboStat
            variant="inset"
            label="Same-Day NP Close"
            value={pctOrDash(conv.sameDayStartRate)}
            target="≥75%"
            status={
              conv.sameDayStartRate == null
                ? undefined
                : conv.sameDayStartRate >= SAME_DAY_NP_TC_TARGET
                  ? "good"
                  : conv.sameDayStartRate >= 0.6
                    ? "warn"
                    : "bad"
            }
          />
        </TcComboStack>

        <TcComboStack title="Treatment">
          <ComboStat
            variant="inset"
            label="TX Plans Presented"
            value={String(presented)}
            note={periodLabel}
          />
          <ComboStat
            variant="inset"
            label="TX Closed/Paid"
            value={pctOrDash(acceptPct)}
            target="60–75%"
            status={
              acceptPct == null
                ? undefined
                : acceptPct >= TX_CLOSE_TARGET_LOW &&
                    acceptPct <= TX_CLOSE_TARGET_HIGH
                  ? "good"
                  : acceptPct >= 0.5
                    ? "warn"
                    : "bad"
            }
          />
          <ComboStat
            variant="inset"
            label="Conversions/Week"
            value={conversionsPerWeek(accepted, range)}
          />
          <ComboStat
            variant="inset"
            label="Implants"
            value={pctOrDash(tc.implantAcceptPct)}
            target="≥60%"
            status={
              tc.implantAcceptPct == null
                ? undefined
                : tc.implantAcceptPct >= IMPLANT_ACCEPT_TARGET
                  ? "good"
                  : tc.implantAcceptPct >= 0.5
                    ? "warn"
                    : "bad"
            }
          />
        </TcComboStack>

        <TcComboStack title="Cancellations">
          <ComboStat
            variant="inset"
            label="Cancellations"
            value={String(appointments.cancelled)}
            note={periodLabel}
          />
          <ComboStat
            variant="inset"
            label="Cancellations Re-Booked"
            value={pctOrDash(tc.cancelRebookRate)}
          />
          <ComboStat
            variant="inset"
            label="No-Shows"
            value={pctOrDash(noShowRate)}
          />
          <ComboStat
            variant="inset"
            label="No-Shows Rebooked"
            value={pctOrDash(tc.noShowRebookRate)}
          />
        </TcComboStack>

        <Card className="flex h-full flex-col">
          <div className="text-[11.5px] font-semibold text-muted">$ Financed</div>
          <div className="mt-1 text-[26px] font-extrabold leading-none tracking-tight tabular-nums">
            {productionAvailable ? formatUsd(financedTotal) : "—"}
          </div>
          <p className="mb-2 mt-1.5 text-[11.5px] text-muted">by financing type</p>
          {finSlices.length > 0 ? (
            <DonutChart slices={finSlices} size={210} showLegend={false} />
          ) : (
            <p className="m-0 text-[12px] text-muted">No financed payments in range.</p>
          )}
        </Card>
      </div>
    </>
  );
}

export function TcPatientJourneySection({
  marketing,
  periodLabel,
  ghlReady,
  subtitle = "Where patients come from and how they move through to paid production",
}: {
  marketing: MarketingSummary;
  periodLabel: string;
  ghlReady: boolean;
  subtitle?: string;
}) {
  return (
    <>
      <SectionHeading title="Patient Journey by Channel" />
      <div className="mb-4">
        {!ghlReady ? (
          <EmptyState
            title="Marketing channels not connected"
            description="Add your GoHighLevel API key and Location ID in Settings to show lead → paid journey by source."
          >
            <Link
              href="/settings/ghl"
              className="inline-flex min-h-9 items-center rounded-lg bg-accent2 px-4 py-2 text-[12.5px] font-semibold text-white transition hover:opacity-95"
            >
              Configure GoHighLevel
            </Link>
          </EmptyState>
        ) : !marketing.available || marketing.channels.length === 0 ? (
          <EmptyState
            title="No channel journey data"
            description="No pipeline opportunities in the selected period."
          />
        ) : (
          <PatientJourneyTable
            channels={marketing.channels}
            periodLabel={periodLabel}
            subtitle={subtitle}
          />
        )}
      </div>
    </>
  );
}

export function TcConversionFunnelSection({
  conv,
  tc,
}: {
  conv: ConversionSummary;
  tc: TcMetrics;
}) {
  return (
    <>
      <SectionHeading title="Conversion Funnel" />
      <div className="mb-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Card title="Presented → Showed → Closed">
          <FunnelChart variant="tc" stages={tc.conversionFunnel} />
        </Card>
        <Card title="Follow-Up Recapture">
          <p className="mt-0 mb-3 text-[11.5px] text-muted">
            Extra cases won after day 1 / 7 / 30
          </p>
          <HBarChart
            rows={[
              {
                label: "By day 1",
                value: tc.followRecapture.day1,
                color: CHANNEL_COLORS[3],
              },
              {
                label: "By day 7",
                value: tc.followRecapture.day7,
                color: CHANNEL_COLORS[4],
              },
              {
                label: "By day 30",
                value: tc.followRecapture.day30,
                color: CHANNEL_COLORS[5],
              },
            ]}
            money={false}
          />
          <h3 className="mb-0.5 mt-[18px] text-[13px] font-bold">
            Acceptance by Case Type
          </h3>
          <p className="mt-0 mb-3 text-[11.5px] text-muted">Denture vs implant</p>
          <HBarChart
            rows={[
              {
                label: "Denture",
                value:
                  tc.dentureAcceptPct != null
                    ? Math.round(tc.dentureAcceptPct * 100)
                    : 0,
                color: CHANNEL_COLORS[1],
              },
              {
                label: "Implant",
                value:
                  tc.implantAcceptPct != null
                    ? Math.round(tc.implantAcceptPct * 100)
                    : 0,
                color: CHANNEL_COLORS[0],
              },
            ]}
            money={false}
          />
        </Card>
      </div>
    </>
  );
}

export function TcDenialReasonsSection({
  declineReasons,
  declineTotal,
  ghlReady,
  periodLabel,
}: {
  declineReasons: DeclineReasonRow[];
  declineTotal: number;
  ghlReady: boolean;
  periodLabel: string;
}) {
  const hasReasons = declineReasons.length > 0;

  return (
    <>
      <SectionHeading title="Top Denial Reasons" />
      <div className="mb-4 max-w-[600px]">
        <Card
          title="Why Presented Plans Didn't Close"
          subtitle={
            hasReasons
              ? `Reasons cases were not accepted · ${declineTotal} unaccepted · ${periodLabel}`
              : `Decline reasons from Open Dental + GoHighLevel · ${periodLabel}`
          }
        >
          {hasReasons ? (
            <HBarChart
              rows={declineReasons.map((row, i) => ({
                label: row.reason,
                value: row.count,
                color: CHANNEL_COLORS[i % CHANNEL_COLORS.length],
              }))}
              money={false}
              labelWidth={195}
            />
          ) : (
            <div>
              <p className="m-0 text-[12px] text-muted">
                Mark treatment plans as rejected in Open Dental (with a decline
                note) or move GHL opportunities to a lost / declined stage.
                {ghlReady
                  ? " GHL is connected — check that pipeline stages include decline labels."
                  : " Connect GoHighLevel in Settings for CRM decline stages."}
              </p>
              {!ghlReady ? (
                <Link
                  href="/settings/ghl"
                  className="mt-3 inline-flex min-h-9 items-center rounded-lg bg-accent2 px-4 py-2 text-[12.5px] font-semibold text-white transition hover:opacity-95"
                >
                  Configure GoHighLevel
                </Link>
              ) : null}
            </div>
          )}
        </Card>
      </div>
    </>
  );
}

export function TcKeyFiguresSection({
  conv,
  tc,
  range,
  productionAvailable,
}: {
  conv: ConversionSummary;
  tc: TcMetrics;
  range: { start: string; end: string };
  productionAvailable: boolean;
}) {
  const presented = tc.tpPresentedCount;
  const accepted = tc.tpAcceptedCount;
  const sameDay = conv.sameDayStarts;
  const acceptPct =
    tc.tpPresentedCents > 0
      ? tc.tpAcceptedCents / tc.tpPresentedCents
      : presented > 0
        ? accepted / presented
        : null;
  const financed = centsToDollars(tc.financingVendorMix.totalCents);

  const figA = [
    { label: "Plans presented", value: String(presented) },
    { label: "Plans closed", value: String(accepted) },
    {
      label: "Presented ($)",
      value: productionAvailable
        ? formatUsd(centsToDollars(tc.tpPresentedCents))
        : "—",
    },
    {
      label: "Closed ($)",
      value: productionAvailable
        ? formatUsd(centsToDollars(tc.tpAcceptedCents))
        : "—",
    },
    {
      label: "Close rate",
      value: pctOrDash(acceptPct),
    },
    {
      label: "$ financed",
      value: productionAvailable ? formatUsd(financed) : "—",
    },
    {
      label: "Conversions / week",
      value: conversionsPerWeek(accepted, range),
    },
  ];

  const funnel = tc.conversionFunnel;
  const funnelShowed = funnel.find((s) => s.label === "Showed")?.value ?? 0;
  const funnelClosed = funnel.find((s) => s.label === "Closed")?.value ?? 0;

  const figB = [
    { label: "Consult showed", value: String(funnelShowed) },
    { label: "Plans closed", value: String(funnelClosed) },
    { label: "Same-day starts", value: String(sameDay) },
    {
      label: "Denture acceptance",
      value:
        tc.dentureAcceptPct != null
          ? `${Math.round(tc.dentureAcceptPct * 100)}%`
          : "—",
    },
    {
      label: "Implant acceptance",
      value:
        tc.implantAcceptPct != null
          ? `${Math.round(tc.implantAcceptPct * 100)}%`
          : "—",
    },
    {
      label: "Same-day NP conversion",
      value: pctOrDash(conv.sameDayStartRate),
    },
    {
      label: "NP success rate",
      value: pctOrDash(tc.npSuccessRate),
    },
    { label: "Phone pick-up rate", value: "—" },
  ];

  return (
    <>
      <SectionHeading title="Key Figures" />
      <div className="mb-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
        <KeyFiguresTable rows={figA} />
        <KeyFiguresTable rows={figB} />
      </div>
    </>
  );
}
