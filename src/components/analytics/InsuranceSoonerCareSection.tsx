import { FunnelChart } from "@/components/charts/FunnelChart";
import { GaugeChart } from "@/components/charts/GaugeChart";
import { Card, ComboStat, SectionHeading } from "@/components/ui/Cards";
import { KeyFiguresTable } from "@/components/ui/KeyFiguresTable";
import { EmptyState } from "@/components/ui/States";
import { CLAIMS_SYNC_NOTE } from "@/lib/metrics/insurance";
import { centsToDollars, formatPct, formatUsd } from "@/lib/metrics";
import type { InsuranceMetrics } from "@/lib/warehouse/insurance-metrics";
import type { LiveProduction } from "@/lib/warehouse/live";

const SC_APPROVAL_TARGET = 85;

export function InsuranceSoonerCareSection({
  production,
  insurance,
  periodLabel,
  scNpSeen,
}: {
  production: LiveProduction;
  insurance: InsuranceMetrics;
  periodLabel: string;
  scNpSeen: number;
}) {
  const scCollected = insurance.claimsAvailable
    ? insurance.soonercareCollectedCents
    : production.paymentMix.soonercare;
  const scProduction = insurance.claimsAvailable
    ? insurance.soonercareBilledCents
    : production.scProductionCents;
  const scCollectedAvailable = insurance.claimsAvailable || production.available;
  const reimbRatio =
    scProduction > 0 ? scCollected / scProduction : null;
  const collectedLabel = scCollectedAvailable
    ? formatUsd(centsToDollars(scCollected))
    : "—";
  const avgPerClaim =
    insurance.soonercareClaimsPaid > 0
      ? formatUsd(
          centsToDollars(
            Math.round(
              insurance.soonercareCollectedCents / insurance.soonercareClaimsPaid,
            ),
          ),
        )
      : "—";
  const accepted = Math.max(
    0,
    insurance.soonercareClaimsSubmitted - insurance.soonercareClaimsCanceled,
  );
  const scClaimApprovalRate =
    insurance.soonercareClaimsSubmitted > 0
      ? accepted / insurance.soonercareClaimsSubmitted
      : null;
  const hasScFunnel =
    insurance.claimsAvailable && insurance.soonercareClaimsSubmitted > 0;
  const hasScPreAuth =
    insurance.claimsAvailable && insurance.soonercarePreAuthsSubmitted > 0;

  return (
    <>
      <SectionHeading title="SoonerCare" tag="Oklahoma Medicaid" />
      <div className="mb-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Card title="Volume & Approval" className="h-full">
          <div className="mt-1 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            <ComboStat
              variant="inset"
              label="SC patients seen"
              value={scNpSeen > 0 ? String(scNpSeen) : "—"}
              note={periodLabel}
            />
            <ComboStat
              variant="inset"
              label="SC claims submitted"
              value={
                insurance.claimsAvailable
                  ? String(insurance.soonercareClaimsSubmitted)
                  : "—"
              }
              note={
                insurance.claimsAvailable
                  ? `Medicaid plans · date sent · ${periodLabel}`
                  : CLAIMS_SYNC_NOTE
              }
            />
            <ComboStat
              variant="inset"
              label="SC approval rate"
              value={
                scClaimApprovalRate != null
                  ? formatPct(scClaimApprovalRate)
                  : "—"
              }
              target="≥85%"
              note="not hold/wait/canceled · date sent"
            />
            <ComboStat
              variant="inset"
              label="SC collected"
              value={collectedLabel}
              note={
                insurance.claimsAvailable
                  ? "claim insurance_payment"
                  : periodLabel
              }
              status={scCollected > 0 ? "good" : undefined}
            />
          </div>
        </Card>
        <Card
          title="SC Claim Approval"
          subtitle="Approved ÷ decided claims"
        >
          <div className="flex justify-center">
            <GaugeChart
              value={
                scClaimApprovalRate != null
                  ? Math.round(scClaimApprovalRate * 1000) / 10
                  : null
              }
              good={SC_APPROVAL_TARGET}
              warn={75}
              target={SC_APPROVAL_TARGET}
              unit="%"
            />
          </div>
          <h3 className="mb-0.5 mt-1.5 text-[13px] font-bold">
            Claims: Submitted → Accepted → Paid
          </h3>
          {hasScFunnel ? (
            <FunnelChart
              stages={[
                {
                  label: "Submitted",
                  value: insurance.soonercareClaimsSubmitted,
                },
                { label: "Accepted (not canceled)", value: accepted },
                { label: "Paid", value: insurance.soonercareClaimsPaid },
              ]}
            />
          ) : (
            <EmptyState
              title="SC claims funnel unavailable"
              description={
                insurance.claimsAvailable
                  ? "No Medicaid / SoonerCare claims in this date-sent range."
                  : "SoonerCare claim counts require a claims sync."
              }
            />
          )}
        </Card>
      </div>
      <div className="mb-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
        <KeyFiguresTable
          title="SoonerCare Figures"
          subtitle="Medicaid reimburses lower and slower — track the gap"
          rows={[
            {
              label: "SC production billed",
              value: scCollectedAvailable
                ? formatUsd(centsToDollars(scProduction))
                : "—",
            },
            {
              label: "SC reimbursement collected",
              value: collectedLabel,
            },
            {
              label: "Reimbursement ratio",
              value: reimbRatio != null ? formatPct(reimbRatio) : "—",
            },
            { label: "Avg reimbursement / claim", value: avgPerClaim },
            {
              label: "Pre-auth approval rate",
              value:
                insurance.soonercarePreAuthApprovalRate != null
                  ? formatPct(insurance.soonercarePreAuthApprovalRate)
                  : "—",
            },
            {
              label: "Claims denied",
              value: insurance.claimsAvailable
                ? String(insurance.soonercareClaimsCanceled)
                : "—",
            },
            {
              label: "Claims pending",
              value: insurance.claimsAvailable
                ? String(insurance.soonercareOutstandingCount)
                : "—",
            },
            {
              label: "Days to payment",
              value:
                insurance.soonercareAvgDaysToPayment != null
                  ? `${insurance.soonercareAvgDaysToPayment}d`
                  : "—",
            },
          ]}
        />
        <Card
          title="SC Pre-Authorizations"
          subtitle="Major/surgical cases needing prior approval"
        >
          {hasScPreAuth ? (
            <div className="mt-1 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              <ComboStat
                variant="inset"
                label="Submitted"
                value={String(insurance.soonercarePreAuthsSubmitted)}
                note={`PreAuth · ${periodLabel}`}
              />
              <ComboStat
                variant="inset"
                label="Approved"
                value={String(insurance.soonercarePreAuthsApproved)}
                note="received in Open Dental"
              />
              <ComboStat
                variant="inset"
                label="Pending"
                value={String(insurance.soonercarePreAuthsPending)}
                note="sent / hold / waiting"
              />
              <ComboStat
                variant="inset"
                label="Approval rate"
                value={
                  insurance.soonercarePreAuthApprovalRate != null
                    ? formatPct(insurance.soonercarePreAuthApprovalRate)
                    : "—"
                }
                target="≥80%"
              />
            </div>
          ) : (
            <EmptyState
              title="No SC pre-authorizations in range"
              description="Medicaid PreAuth claims (ClaimType PreAuth) with date sent in this period will appear here."
            />
          )}
        </Card>
      </div>
    </>
  );
}
