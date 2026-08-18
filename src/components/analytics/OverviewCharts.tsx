"use client";

import { useState } from "react";
import { DonutChart, HBarChart } from "@/components/charts/DonutChart";
import { LineChart } from "@/components/charts/LineChart";
import { clipCurrentYearMonths } from "@/lib/charts/production-trend";
import { StackedColumnChart } from "@/components/charts/StackedColumnChart";
import { Card, SectionHeading } from "@/components/ui/Cards";
import { centsToDollars } from "@/lib/metrics";
import type { LiveProduction } from "@/lib/nexhealth/live";
import {
  buildTreatmentChartCategories,
} from "@/lib/nexhealth/production-category-donut";
import {
  COCKPIT_DISPLAY_CATEGORY_NAMES,
  rollToCockpitDisplayCategories,
} from "@/lib/charts/cockpit-display-categories";
import { emptyCategoryValues } from "@/lib/charts/category-chart";
import type { ChartCategoryDef } from "@/lib/charts/category-chart";
import { CHANNEL_COLORS } from "@/lib/types/viz";

function lastSixMonthCategoryRows(
  treatmentByMonth: LiveProduction["treatmentByMonth"],
  chartCategories: ChartCategoryDef[],
) {
  const keys = chartCategories.map((c) => c.key);
  const mapped = treatmentByMonth.map((r) => ({
    label: r.label,
    values: rollToCockpitDisplayCategories(r.categories),
  }));
  if (mapped.length > 0) return mapped;
  return [
    {
      label: new Date().toLocaleString("en-US", { month: "short" }),
      values: emptyCategoryValues(
        keys.length > 0 ? keys : COCKPIT_DISPLAY_CATEGORY_NAMES,
      ),
    },
  ];
}

function CategoryLegend({ chartCategories }: { chartCategories: ChartCategoryDef[] }) {
  return (
    <div className="w-full shrink-0 rounded-[10px] border border-line bg-background px-3.5 py-3 lg:w-[158px]">
      <div className="mb-2.5 text-[10.5px] font-bold uppercase tracking-wide text-muted">
        Treatment type
      </div>
      <div className="grid gap-2">
        {chartCategories.map((category) => (
          <div key={category.key} className="flex items-center gap-2 text-[12px]">
            <i
              className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm"
              style={{ background: category.color }}
            />
            {category.label}
          </div>
        ))}
      </div>
    </div>
  );
}

function ModeToggle({
  mode,
  onChange,
}: {
  mode: "num" | "pct";
  onChange: (mode: "num" | "pct") => void;
}) {
  return (
    <div className="flex shrink-0 gap-1 rounded-lg border border-line p-0.5">
      {(["num", "pct"] as const).map((m) => (
        <button
          key={m}
          type="button"
          onClick={() => onChange(m)}
          className={`min-h-8 min-w-8 rounded-md px-2.5 text-[12px] font-semibold ${
            mode === m ? "bg-sidebar text-white" : "bg-transparent text-muted"
          }`}
        >
          {m === "num" ? "$" : "%"}
        </button>
      ))}
    </div>
  );
}

function TxTypeLegend({ chartCategories }: { chartCategories: ChartCategoryDef[] }) {
  return <CategoryLegend chartCategories={chartCategories} />;
}

export function TreatmentByTypeSection({
  production,
  subtitle = "Last 6 months · hover a segment for detail",
}: {
  production: LiveProduction;
  subtitle?: string;
}) {
  const [mode, setMode] = useState<"num" | "pct">("num");
  const chartCategories = buildTreatmentChartCategories(
    production.procedureCategories,
    production.treatmentByMonth,
  );
  const rows = lastSixMonthCategoryRows(production.treatmentByMonth, chartCategories);

  return (
    <>
      <SectionHeading title="Treatment by Type" />
      <div className="mb-4">
        <Card>
          <div className="mb-1.5 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="m-0 text-[13px] font-bold leading-snug">
                Production by Treatment Type
              </h3>
              <p className="m-0 mt-0.5 text-[11.5px] text-muted">
                {subtitle}
              </p>
            </div>
            <ModeToggle mode={mode} onChange={setMode} />
          </div>
          <div className="mt-1.5 flex flex-col gap-4 lg:flex-row lg:items-start">
            <div className="min-w-0 flex-1">
              <StackedColumnChart
                rows={rows}
                types={chartCategories}
                mode={mode}
                onModeChange={setMode}
                showToggle={false}
                showLegend={false}
              />
            </div>
            <TxTypeLegend chartCategories={chartCategories} />
          </div>
        </Card>
      </div>
    </>
  );
}

export function PaymentAndDentureSection({
  production,
}: {
  production: LiveProduction;
}) {
  const pm = production.paymentMix;
  const paymentSlices = [
    { label: "Cash", value: centsToDollars(pm.cash) },
    { label: "Insurance", value: centsToDollars(pm.insurance) },
    { label: "Financed", value: centsToDollars(pm.financed) },
    { label: "SoonerCare", value: centsToDollars(pm.soonercare) },
  ];

  const dw = production.dentureWarranty;
  const warrantyRows = [
    { label: "6-month", value: centsToDollars(dw.m6Cents) },
    { label: "1-Yr", value: centsToDollars(dw.y1Cents) },
    { label: "3-Yr", value: centsToDollars(dw.y3Cents) },
    { label: "5-Yr", value: centsToDollars(dw.y5Cents) },
  ];

  return (
    <>
      <SectionHeading title="Denture Production & Payments" />
      <div className="mb-4 grid gap-4 md:grid-cols-2">
        <Card
          title="Denture Production by Warranty"
          subtitle="6-mo · 1-Yr · 3-Yr · 5-Yr"
        >
          <HBarChart rows={warrantyRows} />
        </Card>
        <Card
          title="Payment Mix"
          subtitle="Cash · Insurance · Financed · SoonerCare"
        >
          <DonutChart
            slices={paymentSlices}
            size={180}
            showLegend
            legendFormat="percent"
            legendPlacement="right"
          />
        </Card>
      </div>
    </>
  );
}

export function ProductionTrendSection({
  production,
}: {
  production: LiveProduction;
}) {
  const year = new Date().getFullYear();
  const series =
    production.monthlyProduction.length > 0
      ? production.monthlyProduction.map((s, i) => ({
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
          subtitle="Whole office · this year vs. the two prior · hover for detail"
        >
          <LineChart series={series} money />
        </Card>
      </div>
    </>
  );
}
