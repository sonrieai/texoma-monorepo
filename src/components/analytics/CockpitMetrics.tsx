import type { ReactNode } from "react";
import { ProductionCategoryDonut } from "@/components/charts/ProductionCategoryDonut";
import { Card, ComboStat, SectionHeading } from "@/components/ui/Cards";
import {
  centsToDollars,
  formatPct,
  formatUsd,
  formatUsdCompact,
} from "@/lib/metrics";
import type { ArSummary } from "@/lib/nexhealth/ar";
import type { ConversionSummary } from "@/lib/nexhealth/conversion";
import type { LiveProduction } from "@/lib/nexhealth/live";
import {
  buildProductionCategoryDonutSlices,
  buildProductionChartCategories,
  productionCategoryDonutTotalCents,
} from "@/lib/nexhealth/production-category-donut";
import { cockpitPeriodLabel } from "@/lib/ui/practice-labels";

/** Formulas-tab rate targets (not mockup demo dollars). */
const COLLECTION_RATIO_TARGET = 0.98;
const COLLECTION_RATIO_WARN = 0.95;
const AR_OVER_90_TARGET = 0.15;
const AR_OVER_90_WARN = 0.25;
const NP_SHOW_RATE_TARGET = 0.75;
const NP_SHOW_RATE_WARN = 0.65;
const SAME_DAY_START_TARGET = 0.3;
const SAME_DAY_START_WARN = 0.2;

function presentStatus(value: number): "good" | undefined {
  return value > 0 ? "good" : undefined;
}

function ComboStack({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <Card title={title} className="h-full">
      <div className="mt-1 grid grid-cols-1 gap-2.5">{children}</div>
    </Card>
  );
}

/**
 * Overview cockpit: donut + 4 stacked KPI cards (mockup field layout).
 * Counts and dollars come from warehouse aggregators.
 */
export function CockpitMetrics({
  production,
  accountsReceivable,
  conversion,
  range,
}: {
  production: LiveProduction;
  accountsReceivable: ArSummary;
  conversion: ConversionSummary;
  range?: { start: string; end: string };
}) {
  const period = range ? cockpitPeriodLabel(range.start, range.end) : "";

  const donutSlices = buildProductionCategoryDonutSlices(production);
  const chartCategories = buildProductionChartCategories(production);
  const categoryTotalCents = productionCategoryDonutTotalCents(production);
  const vol = production.procedureVolume;
  const collectionRatio = production.collectionRatio;
  const consultShow =
    conversion.npConsultShowRate != null ? conversion.npConsultShowRate : null;

  return (
    <>
      <SectionHeading title="Cockpit Metrics" tag="top 10" />
      <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,480px)_minmax(0,1fr)] lg:items-start">
        <Card
          title="Production by Category"
          subtitle={`Share of production${period ? ` · ${period}` : ""}`}
          className="min-w-0 w-full"
        >
          <ProductionCategoryDonut
            slices={donutSlices}
            chartCategories={chartCategories}
            size={300}
            centerLabel={formatUsdCompact(centsToDollars(categoryTotalCents))}
            centerSub="total"
          />
        </Card>

        <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2">
          <ComboStack title="New Patient Conversion">
            <ComboStat
              variant="inset"
              label="NP's"
              value={String(conversion.newPatients)}
              note={period ? `leads ${period}` : "leads"}
              status={presentStatus(conversion.newPatients)}
            />
            <ComboStat
              variant="inset"
              label="Consult show rate"
              value={consultShow != null ? formatPct(consultShow) : "—"}
              note={`target ≥${Math.round(NP_SHOW_RATE_TARGET * 100)}%`}
              status={
                consultShow == null
                  ? undefined
                  : consultShow >= NP_SHOW_RATE_TARGET
                    ? "good"
                    : consultShow >= NP_SHOW_RATE_WARN
                      ? "warn"
                      : "bad"
              }
            />
            <ComboStat
              variant="inset"
              label="Same-day starts"
              value={
                conversion.sameDayStartRate != null
                  ? formatPct(conversion.sameDayStartRate)
                  : "—"
              }
              note={`target ≥${Math.round(SAME_DAY_START_TARGET * 100)}%`}
              status={
                conversion.sameDayStartRate == null
                  ? undefined
                  : conversion.sameDayStartRate >= SAME_DAY_START_TARGET
                    ? "good"
                    : conversion.sameDayStartRate >= SAME_DAY_START_WARN
                      ? "warn"
                      : "bad"
              }
            />
            <ComboStat
              variant="inset"
              label="Treatment plan closed"
              value={formatUsd(centsToDollars(conversion.tpClosedCents))}
              note={period ? `accepted $ · ${period}` : "accepted $"}
            />
          </ComboStack>

          <ComboStack title="Production">
            <ComboStat
              variant="inset"
              label="Adjusted production"
              value={formatUsd(centsToDollars(production.netProductionCents))}
              note="after write-offs"
              status={presentStatus(production.netProductionCents)}
            />
            <ComboStat
              variant="inset"
              label="SC production"
              value={formatUsd(
                centsToDollars(production.scProductionCents),
              )}
              note={period ? `SoonerCare · ${period}` : "SoonerCare"}
            />
          </ComboStack>

          <ComboStack title="Procedure Volume">
            <ComboStat
              variant="inset"
              label="Extractions"
              value={String(vol.extractions)}
              note={period || undefined}
            />
            <ComboStat
              variant="inset"
              label="Implants placed"
              value={String(vol.implants)}
              note={period || undefined}
              status={presentStatus(vol.implants)}
            />
            <ComboStat
              variant="inset"
              label="AOX cases"
              value={String(vol.aox)}
              note={period ? `All-on-X · ${period}` : "All-on-X"}
              status={presentStatus(vol.aox)}
            />
            <ComboStat
              variant="inset"
              label="Dentures delivered"
              value={String(vol.dentures)}
              note={period || undefined}
            />
          </ComboStack>

          <ComboStack title="Collections & AR">
            <ComboStat
              variant="inset"
              label="Collection ratio"
              value={
                collectionRatio != null ? formatPct(collectionRatio) : "—"
              }
              note="target ≥98%"
              status={
                collectionRatio == null
                  ? undefined
                  : collectionRatio >= COLLECTION_RATIO_TARGET
                    ? "good"
                    : collectionRatio >= COLLECTION_RATIO_WARN
                      ? "warn"
                      : "bad"
              }
            />
            <ComboStat
              variant="inset"
              label="Total AR"
              value={
                accountsReceivable.available
                  ? formatUsd(centsToDollars(accountsReceivable.totalArCents))
                  : "—"
              }
              note="outstanding"
            />
            <ComboStat
              variant="inset"
              label="AR over 90 days"
              value={
                accountsReceivable.arOver90Ratio != null
                  ? formatPct(accountsReceivable.arOver90Ratio)
                  : "—"
              }
              note="target <15%"
              status={
                accountsReceivable.arOver90Ratio == null
                  ? undefined
                  : accountsReceivable.arOver90Ratio < AR_OVER_90_TARGET
                    ? "good"
                    : accountsReceivable.arOver90Ratio < AR_OVER_90_WARN
                      ? "warn"
                      : "bad"
              }
            />
          </ComboStack>
        </div>
      </div>
    </>
  );
}
