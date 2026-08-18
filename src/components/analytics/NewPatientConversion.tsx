import { ComboStat, SectionHeading } from "@/components/ui/Cards";
import { EmptyState } from "@/components/ui/States";
import { centsToDollars, formatPct, formatUsd } from "@/lib/metrics";
import type { ConversionSummary } from "@/lib/nexhealth/conversion";

const NP_SHOW_RATE_TARGET = 0.75;
const SAME_DAY_START_TARGET = 0.3;

export function NewPatientConversion({
  conversion,
}: {
  conversion: ConversionSummary;
}) {
  const hasNp = conversion.newPatients > 0 || conversion.npConsultBooked > 0;
  const hasTp = conversion.tpClosedCents > 0 || conversion.tpClosedCount > 0;
  const typesConfigured = conversion.npConsultTypeIds.length > 0;
  const consultConfigured = typesConfigured || conversion.npConsultShow > 0;

  if (!conversion.available && !hasTp) {
    return (
      <>
        <SectionHeading title="New patient conversion" />
        <EmptyState
          title="Conversion metrics not configured"
          description="Ask an administrator to configure NP consult appointment types for this location."
        />
      </>
    );
  }

  return (
    <>
      <SectionHeading title="New patient conversion" />
      <div className="mb-4 grid grid-cols-2 items-stretch gap-2.5 md:grid-cols-3 lg:grid-cols-6">
        <ComboStat
          label="NP's"
          value={String(conversion.newPatients)}
          note="first treatment visit"
          status={conversion.newPatients ? "good" : "neutral"}
        />
        <ComboStat
          label="NP consults booked"
          value={String(conversion.npConsultBooked)}
          note={
            typesConfigured
              ? `${conversion.npConsultTypeIds.length} consult type(s)`
              : consultConfigured
                ? "consult procedure codes"
                : "configure consult types"
          }
          status={conversion.npConsultBooked ? "good" : "neutral"}
        />
        <ComboStat
          label="Consult show rate"
          value={
            conversion.npConsultShowRate != null
              ? formatPct(conversion.npConsultShowRate)
              : "—"
          }
          note={`target ≥${Math.round(NP_SHOW_RATE_TARGET * 100)}% · complete ÷ (complete + broken)`}
          status={
            conversion.npConsultShowRate == null
              ? "neutral"
              : conversion.npConsultShowRate >= NP_SHOW_RATE_TARGET
                ? "good"
                : conversion.npConsultShowRate >= 0.5
                  ? "warn"
                  : "bad"
          }
        />
        <ComboStat
          label="Same-day starts"
          value={
            conversion.sameDayStartRate != null
              ? formatPct(conversion.sameDayStartRate)
              : "—"
          }
          note={`${conversion.sameDayStarts} · consult + sold/Tx same day · target ≥${Math.round(SAME_DAY_START_TARGET * 100)}%`}
          status={
            conversion.sameDayStartRate == null
              ? "neutral"
              : conversion.sameDayStartRate >= SAME_DAY_START_TARGET
                ? "good"
                : conversion.sameDayStartRate >= 0.2
                  ? "warn"
                  : "bad"
          }
        />
        <ComboStat
          label="Consult shows"
          value={String(conversion.npConsultShow)}
          note={`${conversion.npConsultNoShow} no-shows · ${conversion.npConsultCancelled} cancelled`}
          status={conversion.npConsultShow ? "good" : "neutral"}
        />
        <ComboStat
          label="Treatment plan closed"
          value={formatUsd(centsToDollars(conversion.tpClosedCents))}
          note={`${conversion.tpClosedCount} fully completed plan(s)`}
          status={conversion.tpClosedCents ? "good" : "neutral"}
        />
      </div>

      {!consultConfigured && !hasNp ? (
        <p className="mb-4 text-[12px] text-muted">
          NP consult counts stay at zero until consult appointment types or
          consult procedure codes are present. Treatment plan totals still use
          fully completed plans.
        </p>
      ) : null}

      {!hasNp && !hasTp && consultConfigured ? (
        <EmptyState
          title="No conversion activity in range"
          description="No new patients, NP consult appointments, or closed treatment plans matched for this date window."
        />
      ) : null}
    </>
  );
}
