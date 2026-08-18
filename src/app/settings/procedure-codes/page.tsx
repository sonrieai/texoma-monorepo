import { ProcedureCodesPanel } from "@/components/settings/ProcedureCodesPanel";
import { AppShell } from "@/components/shell/AppShell";
import { NoticeList } from "@/components/ui/Cards";
import { EmptyState } from "@/components/ui/States";
import { listProcedureCodes } from "@/lib/cdt/procedure-codes-store";

export const dynamic = "force-dynamic";

export default async function ProcedureCodesSettingsPage() {
  let loadError: string | null = null;
  let codes: Awaited<ReturnType<typeof listProcedureCodes>>["codes"] = [];
  let feeScheduleNames: Awaited<
    ReturnType<typeof listProcedureCodes>
  >["feeScheduleNames"] = [null, null, null];

  try {
    const data = await listProcedureCodes();
    codes = data.codes;
    feeScheduleNames = data.feeScheduleNames;
  } catch (e) {
    loadError = e instanceof Error ? e.message : "Unable to load procedure codes";
  }

  if (loadError && codes.length === 0) {
    return (
      <AppShell
        title="Procedure codes"
        subtitle="Settings · synced from Open Dental"
      >
        <EmptyState
          title="Unable to load procedure codes"
          description={loadError}
        />
      </AppShell>
    );
  }

  return (
    <AppShell
      title="Procedure codes"
      subtitle="Settings · synced from Open Dental"
      badge="Admin"
    >
      <NoticeList
        notices={[
          "Read-only view — codes and fees sync from Open Dental via NexHealth.",
          "Run npm run sync:nexhealth after changes in Open Dental (Lists → Procedure Codes).",
          "To change codes, fees, or descriptions, edit Open Dental — not this dashboard.",
        ]}
      />
      <ProcedureCodesPanel
        initialCodes={codes}
        feeScheduleNames={feeScheduleNames}
        loadError={loadError}
      />
    </AppShell>
  );
}
