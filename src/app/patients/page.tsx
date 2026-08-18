import { AppShell } from "@/components/shell/AppShell";
import { PatientTable } from "@/components/patients/PatientTable";
import { ComboStat, NoticeList, SectionHeading } from "@/components/ui/Cards";
import { EmptyState } from "@/components/ui/States";
import { loadWarehousePatientRaws } from "@/lib/mongo/warehouse-patients";
import { mapPatientDirectoryRows, type PatientDirectoryRow } from "@/lib/nexhealth/patients";

export const dynamic = "force-dynamic";

export default async function PatientsPage() {
  let error: string | null = null;
  let rows: PatientDirectoryRow[] = [];

  try {
    const patients = await loadWarehousePatientRaws();
    rows = mapPatientDirectoryRows(patients)
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to load patients";
  }

  if (error) {
    return (
      <AppShell title="Patients" subtitle="Patient directory" badge="Error">
        <EmptyState
          title="Unable to load patients"
          description={
            error ||
            "Patient directory is unavailable. Try again shortly or contact your administrator."
          }
        />
      </AppShell>
    );
  }

  const withContact = rows.filter((p) => p.phone || p.email).length;
  const withAddress = rows.filter(
    (p) => p.addressLine || p.city || p.state || p.postalCode,
  ).length;
  const withDob = rows.filter((p) => p.dateOfBirth).length;

  const missingAddress = rows.filter(
    (p) => !p.inactive && !p.addressLine && !p.city && !p.state && !p.postalCode,
  ).length;

  return (
    <AppShell
      title="Patients"
      subtitle="Protected patient directory"
      badge="PHI"
    >
      <NoticeList
        notices={[
          "This tab shows protected health information (names, contact, address, DOB when available).",
          "Rows reflect the latest warehouse sync (npm run sync:nexhealth).",
          "Overview and Doctor analytics remain aggregate-only and do not use this list.",
          "Empty address/DOB/phone cells mean NexHealth did not return those fields for that patient on this sync.",
          ...(missingAddress > 0
            ? [
                `${missingAddress} active patient(s) have no address in NexHealth — verify Open Dental address fields and Synchronizer mapping (dashboard cannot invent missing upstream data).`,
              ]
            : []),
        ]}
      />

      <SectionHeading title="Directory summary" tag="warehouse" />
      <div className="mb-4 grid grid-cols-2 items-stretch gap-2.5 sm:grid-cols-4">
        <ComboStat label="Patients loaded" value={String(rows.length)} note="directory" />
        <ComboStat label="With phone/email" value={String(withContact)} />
        <ComboStat label="With street/city/state/ZIP" value={String(withAddress)} />
        <ComboStat label="With DOB" value={String(withDob)} />
      </div>

      <SectionHeading title="Patients" tag="PHI" />
      {rows.length === 0 ? (
        <EmptyState
          title="No patients in warehouse"
          description="Run npm run sync:nexhealth after configuring MONGODB_URI."
        />
      ) : (
        <PatientTable patients={rows} />
      )}
    </AppShell>
  );
}
