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
          "Use a Private Integration token with Opportunities read access for your sub-account.",
          "Ad spend and full ROI require ads platform integration — GHL supplies leads and funnel stages only.",
        ]}
      />
      <GhlSettingsPanel />
    </AppShell>
  );
}
