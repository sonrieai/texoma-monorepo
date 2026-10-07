import {
  InsuranceArAgingSection,
  InsuranceClaimsPipelineSection,
  InsuranceCockpitMetrics,
  InsuranceCollectionsTrendSection,
  InsuranceOutstandingClaimsSection,
} from "@/components/analytics/InsuranceDashboard";
import { InsuranceSoonerCareSection } from "@/components/analytics/InsuranceSoonerCareSection";
import { NoticeList } from "@/components/ui/Cards";
import type { LiveOverview } from "@/lib/warehouse/live";

const SC_CLASSIFICATION_NOTICE =
  "SoonerCare payments are classified from payment text; SC production uses patient carrier or SC chart codes. The two figures can differ.";

type InsurancePageContentProps = {
  data: LiveOverview;
  periodLabel: string;
};

export function InsurancePageContent({
  data,
  periodLabel,
}: InsurancePageContentProps) {
  const prod = data.production;
  const scPayments = prod.paymentMix.soonercare;
  const scProduction = prod.scProductionCents;
  const notices = [
    ...data.accountsReceivable.notices,
    ...data.insurance.notices,
  ];
  if (scPayments > 0 && scProduction > 0 && scPayments !== scProduction) {
    notices.push(SC_CLASSIFICATION_NOTICE);
  }

  return (
    <>
      <NoticeList notices={notices.slice(0, 3)} />
      <InsuranceCockpitMetrics
        production={prod}
        accountsReceivable={data.accountsReceivable}
        insurance={data.insurance}
        periodLabel={periodLabel}
      />
      <InsuranceClaimsPipelineSection
        insurance={data.insurance}
        periodLabel={periodLabel}
      />
      <InsuranceOutstandingClaimsSection insurance={data.insurance} />
      <InsuranceArAgingSection
        accountsReceivable={data.accountsReceivable}
        insurance={data.insurance}
      />
      <InsuranceCollectionsTrendSection
        production={prod}
        periodLabel={periodLabel}
      />
      <InsuranceSoonerCareSection
        production={prod}
        insurance={data.insurance}
        periodLabel={periodLabel}
        scNpSeen={data.tcMetrics.scNpSeen}
      />
    </>
  );
}
