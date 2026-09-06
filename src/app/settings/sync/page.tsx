import { SyncPanel } from "@/components/settings/SyncPanel";
import { AppShell } from "@/components/shell/AppShell";
import { NoticeList } from "@/components/ui/Cards";

export const dynamic = "force-dynamic";

export default function SyncSettingsPage() {
  return (
    <AppShell
      title="Data sync"
      subtitle="Settings · NexHealth warehouse"
      badge="Admin"
    >
      <NoticeList
        notices={[
          "Overview and KPI pages read MongoDB only — they do not call NexHealth on each page load.",
          "Use Sync now after Open Dental procedure code changes or before reviewing fresh KPIs.",
          "Production also runs an automatic daily sync via Vercel Cron (see docs/SYNC_SCHEDULE.md).",
        ]}
      />
      <SyncPanel />
    </AppShell>
  );
}
