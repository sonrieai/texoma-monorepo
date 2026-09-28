import { GhlSettingsPanel } from "@/components/settings/GhlSettingsPanel";
import { AppShell } from "@/components/shell/AppShell";
import { NoticeList } from "@/components/ui/Cards";

export const dynamic = "force-dynamic";

export default function GhlSettingsPage() {
  return (
    <AppShell
      title="GoHighLevel"
      subtitle="Settings · Marketing CRM"
      badge="Admin"
    >
      <NoticeList
        notices={[
          "Marketing and TC journey pages fetch GHL opportunities live at page load — they are not synced to MongoDB.",
          "Use a Private Integration token with Opportunities read + Ad Publishing read (adPublishing.readonly) for spend/ROI.",
          "Connect Facebook and/or Google ads in GHL so Marketing can fill Total ad spend, ROI, and Cost/arch.",
        ]}
      />
      <GhlSettingsPanel />
    </AppShell>
  );
}
