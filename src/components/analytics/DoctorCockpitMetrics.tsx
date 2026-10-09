import type { ReactNode } from "react";
import { DonutChart } from "@/components/charts/DonutChart";
import { ProductionCategoryDonut } from "@/components/charts/ProductionCategoryDonut";
import { LineChart } from "@/components/charts/LineChart";
import { Card, ComboDuo, ComboStat, SectionHeading } from "@/components/ui/Cards";
import {
  centsToDollars,
  formatCount,
  formatPct,
  formatUsd,
  formatUsdCompact,
} from "@/lib/metrics";
import type { LiveProviderRow } from "@/lib/warehouse/live";
import {
  buildProductionChartCategories,
  buildProviderProductionCategoryDonutSlices,
  providerProductionCategoryDonutTotalCents,
} from "@/lib/warehouse/production-category-donut";
import { normalizeToCockpitDisplayCategory } from "@/lib/charts/cockpit-display-categories";
import { CHANNEL_COLORS } from "@/lib/types/viz";

const SAME_DAY_NP_TARGET = 0.3;

const FIXED_PRODUCTION_CATEGORY = "Fixed (All-on-4)";
const REMOVABLE_PRODUCTION_CATEGORIES = ["Dentures", "Partial Dentures"] as const;

function sumCategoryProductionCents(
  rows: LiveProviderRow["production"]["productionByCategory"],
  categories: readonly string[],
): number {
  const names = new Set<string>(categories);
  return rows.reduce(
    (sum, row) => sum + (names.has(row.category) ? row.productionCents : 0),
    0,
  );
}

const RESTORATIVE_SLICES = new Set(["Hygiene", "Restorative Dentistry"]);

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
  const totals = new Map<string, number>();
  for (const row of rows) {
    const bucket = normalizeToCockpitDisplayCategory(row.category);
    if (!RESTORATIVE_SLICES.has(bucket) || row.productionCents <= 0) continue;
    totals.set(bucket, (totals.get(bucket) ?? 0) + row.productionCents);
  }
  return [...totals.entries()]
    .map(([label, cents]) => ({
      label,
      value: centsToDollars(cents),
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
  const fixedProductionCents = sumCategoryProductionCents(
    prod.productionByCategory,
    [FIXED_PRODUCTION_CATEGORY],
  );
  const removableProductionCents = sumCategoryProductionCents(
    prod.productionByCategory,
    REMOVABLE_PRODUCTION_CATEGORIES,
  );

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
              value={String(provider.scNpSeen)}
              note="SoonerCare new patients"
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
              value={String(provider.npClosedDeferred)}
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
                {
                  label: "F/ Production",
                  value:
                    productionAvailable
                      ? formatUsd(centsToDollars(fixedProductionCents))
                      : "—",
                },
                {
                  label: "FR/ Production",
                  value:
                    productionAvailable
                      ? formatUsd(centsToDollars(removableProductionCents))
                      : "—",
                },
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
  periodTrend,
  periodLabel,
}: {
  providerName: string;
  periodTrend: { label: string; dollars: number }[];
  periodLabel: string;
}) {
  const series = [
    {
      label: "Production",
      values: periodTrend.map((point) => point.dollars),
      color: CHANNEL_COLORS[0],
    },
  ];

  return (
    <>
      <SectionHeading title="Production Trend" />
      <div className="mb-4 min-w-0">
        <Card
          title="Production"
          subtitle={`${providerName} · ${periodLabel} · hover for detail`}
          className="min-w-0 overflow-hidden"
        >
          <LineChart
            series={series}
            xLabels={periodTrend.map((point) => point.label)}
            money
          />
        </Card>
      </div>
    </>
  );
}
