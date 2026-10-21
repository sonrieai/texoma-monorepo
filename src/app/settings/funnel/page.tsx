import { FunnelSettingsPanel } from "@/components/settings/FunnelSettingsPanel";
import { DashboardFrame } from "@/components/shell/DashboardFrame";
import { NoticeList } from "@/components/ui/Cards";

export const dynamic = "force-dynamic";

export default function FunnelSettingsPage() {
  return (
    <DashboardFrame
      title="GoHighLevel funnel"
      subtitle="Settings · Stage ids"
      badge="Admin"
    >
      <NoticeList
        notices={[
          "Call Center pipeline is excluded. Leads + Treatment Coordinator ids drive Marketing and TC funnels.",
          "Renaming a stage in GoHighLevel does not change ids — update overrides only when ids change.",
        ]}
      />
      <FunnelSettingsPanel />
    </DashboardFrame>
  );
}
