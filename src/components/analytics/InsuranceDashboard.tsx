import type { ReactNode } from "react";
import { AgingHeatMapTable } from "@/components/analytics/AgingHeatMapTable";
import { DonutChart, HBarChart } from "@/components/charts/DonutChart";
import { FunnelChart } from "@/components/charts/FunnelChart";
import { LineChart } from "@/components/charts/LineChart";
import { Card, ComboStat, SectionHeading } from "@/components/ui/Cards";
import { EmptyState } from "@/components/ui/States";
import {
  CLAIMS_SYNC_NOTE,
  COLLECTION_RATIO_TARGET,
  COLLECTION_RATIO_WARN,
  arAgingTotalCents,
  insuranceCollectionsTrend,
  insurancePayerMixSlices,
} from "@/lib/metrics/insurance";
import { centsToDollars, formatPct, formatUsd } from "@/lib/metrics";
import type { ArSummary } from "@/lib/warehouse/ar";
import type { InsuranceMetrics } from "@/lib/warehouse/insurance-metrics";
import type { LiveProduction } from "@/lib/warehouse/live";
import { CHANNEL_COLORS } from "@/lib/types/viz";

const DAYS_IN_AR_TARGET = 30;
const DAYS_IN_AR_WARN = 45;
const DENIAL_RATE_TARGET = 0.05;
const DENIAL_RATE_WARN = 0.08;

function InsuranceComboStack({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <Card title={title} className="h-full">
      <div className="mt-1 grid grid-cols-1 gap-2.5">{children}</div>
    </Card>
  );
}

function usdOrDash(cents: number, available: boolean): string {
  if (!available) return "—";
  return formatUsd(centsToDollars(cents));
}

function ratioStatus(
  value: number | null,
  good: number,
  warn: number,
  higherBetter = true,
): "good" | "warn" | "bad" | undefined {
  if (value == null) return undefined;
  if (higherBetter) {
    if (value >= good) return "good";
    if (value >= warn) return "warn";
    return "bad";
  }
  if (value <= good) return "good";
  if (value <= warn) return "warn";
  return "bad";
}

const CLAIMS_EMPTY =
  "Submitted, paid, and denial metrics will appear here when claims data is connected.";

export function InsuranceCockpitMetrics({
  production,
  accountsReceivable,
  insurance,
  periodLabel,
}: {
  production: LiveProduction;
  accountsReceivable: ArSummary;
  insurance: InsuranceMetrics;
  periodLabel: string;
}) {
  const mix = production.paymentMix;
  const claimPayerSlices = insurance.payerMix.map((row) => ({
    label: row.label,
    value: centsToDollars(row.cents),
  }));
  const payerSlices =
    claimPayerSlices.length > 0
      ? claimPayerSlices
      : insurancePayerMixSlices(mix);
  const payerTotal = payerSlices.reduce((sum, s) => sum + s.value, 0);
  const collectionRatio = insurance.claimsAvailable
    ? insurance.collectionRatio
    : production.collectionRatio;
  const ar = accountsReceivable;
  const insuranceArCents = insurance.balancesAvailable
    ? insurance.insuranceArCents
    : ar.insuranceArCents;
  const insuranceArAvailable = insurance.balancesAvailable || ar.available;

  return (
    <>
      <SectionHeading title="Cockpit Metrics" tag="insurance coordinator" />
      <div className="mb-1.5 grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
        <InsuranceComboStack title="Claims">
          <ComboStat
            variant="inset"
            label="Submitted"
            value={
              insurance.claimsAvailable
                ? String(insurance.claimsSubmitted)
                : "—"
            }
            note={
              insurance.claimsAvailable
                ? `date sent · ${periodLabel}`
                : CLAIMS_SYNC_NOTE
            }
          />
          <ComboStat
            variant="inset"
            label="Paid"
            value={
              insurance.claimsAvailable ? String(insurance.claimsPaid) : "—"
            }
            note={`received/paid · ${periodLabel}`}
          />
          <ComboStat
            variant="inset"
            label="Clean claim rate"
            value="—"
            target="≥95%"
            note="not in Open Dental claims"
          />
          <ComboStat
            variant="inset"
            label="Denial rate"
            value={
              insurance.denialRate != null
                ? formatPct(insurance.denialRate)
                : "—"
            }
            target="≤5%"
            note="canceled ÷ submitted"
            status={ratioStatus(
              insurance.denialRate,
              DENIAL_RATE_TARGET,
              DENIAL_RATE_WARN,
              false,
            )}
          />
        </InsuranceComboStack>

        <InsuranceComboStack title="Collections & AR">
          <ComboStat
            variant="inset"
            label="Collection ratio"
            value={collectionRatio != null ? formatPct(collectionRatio) : "—"}
            target="≥98%"
            note={
              insurance.claimsAvailable
                ? "collected ÷ allowed"
                : "collections ÷ gross production"
            }
            status={ratioStatus(
              collectionRatio,
              COLLECTION_RATIO_TARGET,
              COLLECTION_RATIO_WARN,
            )}
          />
          <ComboStat
            variant="inset"
            label="Insurance collected"
            value={usdOrDash(
              insurance.claimsAvailable
                ? insurance.collectedCents
                : mix.insurance,
              insurance.claimsAvailable || production.available,
            )}
            note={periodLabel}
            status={
              (insurance.claimsAvailable
                ? insurance.collectedCents
                : mix.insurance) > 0
                ? "good"
                : undefined
            }
          />
          <ComboStat
            variant="inset"
            label="Patient AR"
            value={usdOrDash(ar.patientArCents, ar.available)}
            note="patient guarantor portion"
          />
          <ComboStat
            variant="inset"
            label="Insurance AR"
            value={usdOrDash(insuranceArCents, insuranceArAvailable)}
            note={
              insurance.balancesAvailable
                ? "insurance billed balances"
                : "guarantor insurance estimate"
            }
          />
          <ComboStat
            variant="inset"
            label="SC AR"
            value={
              insurance.soonercareArCents > 0
                ? formatUsd(centsToDollars(insurance.soonercareArCents))
                : "—"
            }
            note="Medicaid / SoonerCare outstanding"
          />
          <ComboStat
            variant="inset"
            label="Days in AR"
            value={
              insurance.daysInAr != null ? `${insurance.daysInAr}d` : "—"
            }
            note="est. aging midpoint"
            target="≤30d"
            status={ratioStatus(
              insurance.daysInAr != null ? insurance.daysInAr : null,
              DAYS_IN_AR_TARGET,
              DAYS_IN_AR_WARN,
              false,
            )}
          />
        </InsuranceComboStack>

        <InsuranceComboStack title="Eligibility & Pre-Auth">
          <ComboStat
            variant="inset"
            label="Elig. verified"
            value="—"
            target="≥95%"
            note="not in Open Dental API"
          />
          <ComboStat
            variant="inset"
            label="Pre-auths submitted"
            value="—"
            note={periodLabel}
          />
          <ComboStat
            variant="inset"
            label="Pre-auth approval"
            value="—"
            target="≥80%"
          />
          <ComboStat
            variant="inset"
            label="Avg turnaround"
            value="—"
            note="submit → decision"
          />
        </InsuranceComboStack>

        <Card className="flex h-full flex-col">
          <div className="text-[11.5px] font-semibold text-muted">
            Collected by payer
          </div>
          <div className="mt-1 text-[26px] font-extrabold leading-none tracking-tight tabular-nums">
            {production.available || insurance.claimsAvailable
              ? formatUsd(payerTotal)
              : "—"}
          </div>
          <p className="mb-2 mt-1.5 text-[11.5px] text-muted">
            {claimPayerSlices.length > 0
              ? `insurance $ · ${periodLabel}`
              : `payments · ${periodLabel}`}
          </p>
          {payerSlices.length > 0 ? (
            <DonutChart slices={payerSlices} size={210} showLegend={false} />
          ) : (
            <p className="m-0 text-[12px] text-muted">
              No classified payments in range.
            </p>
          )}
        </Card>
      </div>
    </>
  );
}

export function InsuranceClaimsPipelineSection({
  insurance,
  periodLabel,
}: {
  insurance: InsuranceMetrics;
  periodLabel: string;
}) {
  const accepted = Math.max(
    0,
    insurance.claimsSubmitted - insurance.claimsCanceled,
  );
  return (
    <>
      <SectionHeading title="Claims Pipeline" />
      <div className="mb-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Card
          title="Submitted → Accepted → Paid"
          subtitle={`First-pass acceptance drives cash flow · ${periodLabel}`}
        >
          {insurance.claimsAvailable ? (
            <FunnelChart
              stages={[
                { label: "Submitted", value: insurance.claimsSubmitted },
                { label: "Accepted (not canceled)", value: accepted },
                { label: "Paid", value: insurance.claimsPaid },
              ]}
            />
          ) : (
            <EmptyState
              title="Claims data not available yet"
              description={CLAIMS_EMPTY}
            />
          )}
        </Card>
        <Card
          title="Denial Recovery"
          subtitle="Canceled claims in Open Dental (not OD denial-reason codes)"
        >
          {insurance.claimsAvailable ? (
            <HBarChart
              rows={[
                {
                  label: "Canceled",
                  value: insurance.claimsCanceled,
                  color: "var(--bad)",
                },
                {
                  label: "Paid",
                  value: insurance.claimsPaid,
                  color: CHANNEL_COLORS[2],
                },
              ]}
              money={false}
            />
          ) : (
            <EmptyState
              title="Denial metrics unavailable"
              description="Appeals, recoveries, and top denial reasons are not on Open Dental GET /claims."
            />
          )}
        </Card>
      </div>
    </>
  );
}

export function InsuranceOutstandingClaimsSection({
  insurance,
}: {
  insurance: InsuranceMetrics;
}) {
  const oc = insurance.outstanding;
  const slices = [
    { label: "0-29 Days", value: centsToDollars(oc.d0Cents) },
    { label: "30-59 Days", value: centsToDollars(oc.d30Cents) },
    { label: "60-89 Days", value: centsToDollars(oc.d60Cents) },
    { label: "90+ Days", value: centsToDollars(oc.d90Cents) },
  ].filter((s) => s.value > 0);

  return (
    <>
      <SectionHeading title="Outstanding Claims" />
      <div className="mb-4 max-w-[440px]">
        <Card
          title="Outstanding Claims by Age"
          subtitle={`Unpaid insurance claims still awaiting payment · ${insurance.outstandingClaimCount} claims · ${formatUsd(centsToDollars(insurance.outstandingTotalCents))} open`}
        >
          {insurance.claimsAvailable && slices.length > 0 ? (
            <DonutChart
              slices={slices}
              centerLabel={formatUsd(
                centsToDollars(insurance.outstandingTotalCents),
              )}
            />
          ) : (
            <EmptyState
              title="Outstanding claims unavailable"
              description="Unpaid (sent) claim aging appears after claims sync."
            />
          )}
        </Card>
      </div>
    </>
  );
}

export function InsuranceArAgingSection({
  accountsReceivable,
  insurance,
}: {
  accountsReceivable: ArSummary;
  insurance: InsuranceMetrics;
}) {
  const aging = insurance.balancesAvailable
    ? insurance.aging
    : accountsReceivable.aging;
  const totalCents = arAgingTotalCents(aging);
  const slices = [
    { label: "0–30 days", value: centsToDollars(aging.under30Cents) },
    { label: "31–60 days", value: centsToDollars(aging.days31to60Cents) },
    { label: "61–90 days", value: centsToDollars(aging.days61to90Cents) },
    { label: "90+ days", value: centsToDollars(aging.over90Cents) },
  ].filter((s) => s.value > 0);
  const hasAging =
    (insurance.balancesAvailable || accountsReceivable.available) &&
    totalCents > 0;
  const sourceNote = insurance.balancesAvailable
    ? "insurance billed balances"
    : "guarantor totals";

  return (
    <>
      <SectionHeading title="Insurance AR Aging" />
      <div className="mb-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Card
          title="Aging AR"
          subtitle={`Outstanding billed by age · ${sourceNote} (snapshot)`}
        >
          {hasAging ? (
            <DonutChart
              slices={slices}
              centerLabel={formatUsd(centsToDollars(totalCents))}
            />
          ) : (
            <EmptyState
              title="No aging detail"
              description="Aging buckets appear when insurance or guarantor balances sync."
            />
          )}
        </Card>
        <Card
          title="Aging Detail"
          subtitle="Insurance receivables awaiting payer"
        >
          {hasAging ? (
            <AgingHeatMapTable aging={aging} />
          ) : (
            <EmptyState
              title="No aging table"
              description="Insurance aging shares will populate after balances sync."
            />
          )}
        </Card>
      </div>
    </>
  );
}

export function InsuranceCollectionsTrendSection({
  production,
}: {
  production: LiveProduction;
}) {
  const trend = insuranceCollectionsTrend(
    production.monthlyCollections,
    production.monthlyProduction,
  );
  const hasTrend = trend.xLabels.length > 0;

  return (
    <>
      <SectionHeading title="Collections Trend" />
      <div className="mb-4">
        <Card
          title="Net Production vs Collected"
          subtitle="Hover for month detail and the collection gap · last 6 months · payments + production"
        >
          {hasTrend ? (
            <LineChart
              money
              xLabels={trend.xLabels}
              series={[
                {
                  label: "Net production",
                  values: trend.production,
                  color: "var(--accent)",
                },
                {
                  label: "Collected",
                  values: trend.collected,
                  color: "var(--accent2)",
                },
              ]}
            />
          ) : (
            <EmptyState
              title="No collections trend"
              description="No payments in range."
            />
          )}
        </Card>
      </div>
    </>
  );
}
