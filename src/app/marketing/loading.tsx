import { DashboardLoading } from "@/components/shell/DashboardFrame";

export default function MarketingLoading() {
  return (
    <DashboardLoading
      title="Marketing"
      subtitle="Spend, ROI, and attribution"
      label="Loading marketing data…"
    />
  );
}
