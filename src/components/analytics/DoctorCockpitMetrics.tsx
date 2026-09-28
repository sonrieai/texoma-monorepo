import type { ReactNode } from "react";
import { DonutChart } from "@/components/charts/DonutChart";
import { ProductionCategoryDonut } from "@/components/charts/ProductionCategoryDonut";
import { LineChart } from "@/components/charts/LineChart";
import { clipCurrentYearMonths } from "@/lib/charts/production-trend";
import { Card, ComboDuo, ComboStat, SectionHeading } from "@/components/ui/Cards";
import {
  centsToDollars,
  formatCount,
  formatPct,
  formatUsd,
  formatUsdCompact,
} from "@/lib/metrics";
import type { LiveProviderRow } from "@/lib/warehouse/live";
import type { MonthlyProductionSeries } from "@/lib/warehouse/production";
import {
  buildProductionChartCategories,
  buildProviderProductionCategoryDonutSlices,
  providerProductionCategoryDonutTotalCents,
} from "@/lib/warehouse/production-category-donut";
import { CHANNEL_COLORS } from "@/lib/types/viz";

const SAME_DAY_NP_TARGET = 0.3;

const RESTORATIVE_CATEGORIES = new Set([
  "Restorative Dentistry",
  "Restorative",
  "Hygiene",
]);

function DoctorComboStack({
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

function toRestorativeSlices(
  rows: LiveProviderRow["production"]["productionByCategory"],
): { label: string; value: number }[] {
  return rows
    .filter((r) => RESTORATIVE_CATEGORIES.has(r.category) && r.productionCents > 0)
    .map((r) => ({
      label: r.category === "Restorative" ? "Restorative" : r.category,
      value: centsToDollars(r.productionCents),
    }))
    .sort((a, b) => b.value - a.value);
}

export function DoctorCockpitMetrics({
  provider,
  periodLabel,
  productionAvailable,
}: {
  provider: LiveProviderRow;
  periodLabel: string;
  productionAvailable: boolean;
}) {
  const prod = provider.production;
  const vol = prod.procedureVolume;
  const npSeen = provider.npConsultShow;
  const sameDayCloseRate = npSeen > 0 ? provider.sameDayNp / npSeen : null;
  const avgPerPatient =
    npSeen > 0 ? centsToDollars(prod.grossProductionCents) / npSeen : null;
  const remakeRate = vol.dentures > 0 ? vol.remakes / vol.dentures : null;

  const donutSlices = buildProviderProductionCategoryDonutSlices(prod);
  const chartCategories = buildProductionChartCategories();
  const categoryTotalCents = providerProductionCategoryDonutTotalCents(prod);
  const restorativeSlices = toRestorativeSlices(prod.productionByCategory);
  const restorativeTotal = restorativeSlices.reduce((s, x) => s + x.value, 0);

  return (
    <>
      <SectionHeading title="Cockpit Metrics" tag={provider.name} />
      <div className="mb-4 grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,480px)_minmax(0,1fr)] md:items-start">
        <Card
          title="Production by Category"
          subtitle={`Share of production · ${periodLabel}`}
          className="min-w-0 w-full"
        >
          <ProductionCategoryDonut
            slices={donutSlices}
            chartCategories={chartCategories}
            size={300}
            centerLabel={
              productionAvailable
                ? formatUsdCompact(centsToDollars(categoryTotalCents))
                : "—"
            }
            centerSub="total"
          />
        </Card>

        <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2">
          <DoctorComboStack title="New Patients">
            <ComboStat
              variant="inset"
              label="NP's seen"
              value={String(npSeen)}
              note={periodLabel}
            />
            <ComboStat
              variant="inset"
              label="SC NP's seen"
              value="—"
              note="SoonerCare NPs"
            />
            <ComboStat
              variant="inset"
              label="Same-Day NP Close"
              value={sameDayCloseRate != null ? formatPct(sameDayCloseRate) : "—"}
              target="≥30%"
              status={
                sameDayCloseRate == null
                  ? undefined
                  : sameDayCloseRate >= SAME_DAY_NP_TARGET
                    ? "good"
                    : sameDayCloseRate >= 0.2
                      ? "warn"
                      : "bad"
              }
            />
            <ComboStat
              variant="inset"
              label="NPs closed"
              value="—"
              note="non-same day"
            />
          </DoctorComboStack>

          <DoctorComboStack title="Surgical Volume">
            <ComboStat
              variant="inset"
              label="Extractions"
              value={formatCount(vol.extractions, productionAvailable)}
              note={periodLabel}
            />
            <ComboStat
              variant="inset"
              label="Implants"
              value={formatCount(vol.implants, productionAvailable)}
              note={periodLabel}
              status={vol.implants > 0 ? "good" : undefined}
            />
          </DoctorComboStack>

          <DoctorComboStack title="Dentures">
            <ComboStat
              variant="inset"
              label="Dentures"
              value={formatCount(vol.dentures, productionAvailable)}
              note={periodLabel}
            />
            <ComboStat
              variant="inset"
              label="Partials"
              value={formatCount(vol.partials, productionAvailable)}
              note={periodLabel}
            />
            <ComboStat
              variant="inset"
              label="Denture Remakes"
              value={formatCount(vol.remakes, productionAvailable)}
              note={
                remakeRate != null
                  ? `${formatPct(remakeRate)} of dentures`
                  : undefined
              }
              status={
                remakeRate == null
                  ? undefined
                  : remakeRate <= 0.05
                    ? "good"
                    : remakeRate <= 0.1
                      ? "warn"
                      : "bad"
              }
            />
          </DoctorComboStack>

          <DoctorComboStack title="Production">
            <ComboStat
              variant="inset"
              label="Avg production / patient"
              value={
                avgPerPatient != null && productionAvailable
                  ? formatUsd(avgPerPatient)
                  : "—"
              }
            />
            <ComboDuo
              items={[
                {
                  label: "Non-SC Production",
                  value:
                    productionAvailable
                      ? formatUsd(
                          centsToDollars(
                            prod.grossProductionCents -
                              prod.scProductionCents,
                          ),
                        )
                      : "—",
                },
                {
                  label: "SC Production",
                  value:
                    productionAvailable
                      ? formatUsd(centsToDollars(prod.scProductionCents))
                      : "—",
                },
              ]}
            />
            <ComboDuo
              items={[
                { label: "F/ Production", value: "—" },
                { label: "FR/ Production", value: "—" },
              ]}
            />
          </DoctorComboStack>
        </div>
      </div>

      {restorativeSlices.length > 0 ? (
        <>
          <SectionHeading title="Restorative Treatment" />
          <div className="mb-4 w-full min-w-0">
            <Card
              title="Restorative Production by Type"
              subtitle={`${provider.name} · fillings, crowns & more · ${periodLabel}`}
              className="max-w-full"
            >
              <div className="mx-auto w-full max-w-[min(100%,300px)]">
                <DonutChart
                  slices={restorativeSlices}
                  size={300}
                  centerLabel={formatUsdCompact(restorativeTotal)}
                  centerSub="total"
                />
              </div>
            </Card>
          </div>
        </>
      ) : null}
    </>
  );
}

export function DoctorProductionTrendSection({
  providerName,
  monthlyProduction,
}: {
  providerName: string;
  monthlyProduction: MonthlyProductionSeries[];
}) {
  const year = new Date().getFullYear();
  const series =
    monthlyProduction.length > 0
      ? monthlyProduction.map((s, i) => ({
          label: s.label,
          values: clipCurrentYearMonths(s.year, s.months),
          color: CHANNEL_COLORS[[3, 2, 0][i] ?? i],
        }))
      : [
          {
            label: String(year - 2),
            values: Array<number>(12).fill(0),
            color: CHANNEL_COLORS[3],
          },
          {
            label: String(year - 1),
            values: Array<number>(12).fill(0),
            color: CHANNEL_COLORS[2],
          },
          {
            label: String(year),
            values: clipCurrentYearMonths(year, Array<number>(12).fill(0)),
            color: CHANNEL_COLORS[0],
          },
        ];

  return (
    <>
      <SectionHeading title="Production Trend" />
      <div className="mb-4">
        <Card
          title="Monthly Production by Year"
          subtitle={`${providerName} · this year vs. the two prior · hover for detail`}
        >
          <LineChart series={series} money />
        </Card>
      </div>
    </>
  );
}
