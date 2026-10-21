import { GhlSettingsPanel } from "@/components/settings/GhlSettingsPanel";
import { DashboardFrame } from "@/components/shell/DashboardFrame";
import { NoticeList } from "@/components/ui/Cards";

export const dynamic = "force-dynamic";

export default function GhlSettingsPage() {
  return (
    <DashboardFrame
      title="GoHighLevel"
      subtitle="Settings · Marketing CRM"
      badge="Admin"
    >
      <NoticeList
        notices={[
          "Marketing and TC journey pages fetch GHL opportunities live at page load — they are not copied into the JSON settings file.",
          "Use a Private Integration token with Opportunities read. Ad spend is not run through GoHighLevel — Total ad spend, ROI, and Cost/arch stay unavailable from GHL.",
          "Marketing funnel uses pipeline and stage ids configured for Leads and Treatment Coordinator (not pipeline names).",
        ]}
      />
      <GhlSettingsPanel />
    </DashboardFrame>
  );
}
