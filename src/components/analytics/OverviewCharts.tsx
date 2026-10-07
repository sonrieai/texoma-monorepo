"use client";

import { useState } from "react";
import { DonutChart, HBarChart } from "@/components/charts/DonutChart";
import { LineChart } from "@/components/charts/LineChart";
import { StackedColumnChart } from "@/components/charts/StackedColumnChart";
import { Card, SectionHeading } from "@/components/ui/Cards";
import { centsToDollars } from "@/lib/metrics";
import type { LiveProduction } from "@/lib/warehouse/live";
import {
  buildTreatmentChartCategories,
} from "@/lib/warehouse/production-category-donut";
import {
  COCKPIT_DISPLAY_CATEGORY_NAMES,
  rollToCockpitDisplayCategories,
} from "@/lib/charts/cockpit-display-categories";
import { emptyCategoryValues } from "@/lib/charts/category-chart";
import type { ChartCategoryDef } from "@/lib/charts/category-chart";
import { CHANNEL_COLORS } from "@/lib/types/viz";

function categoryRows(
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
  const rows = categoryRows(production.treatmentByMonth, chartCategories);

  return (
    <>
      <SectionHeading title="Treatment by Type" />
      <div className="mb-4 min-w-0">
        <Card className="min-w-0 overflow-hidden">
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
  const pw = production.partialWarranty;
  const dentureWarrantyRows = [
    { label: "6-month", value: centsToDollars(dw.m6Cents) },
    { label: "1-Yr", value: centsToDollars(dw.y1Cents) },
    { label: "3-Yr", value: centsToDollars(dw.y3Cents) },
    { label: "5-Yr", value: centsToDollars(dw.y5Cents) },
  ];
  const partialWarrantyRows = [
    { label: "6-month", value: centsToDollars(pw.m6Cents) },
    { label: "1-Yr", value: centsToDollars(pw.y1Cents) },
    { label: "3-Yr", value: centsToDollars(pw.y3Cents) },
    { label: "5-Yr", value: centsToDollars(pw.y5Cents) },
  ];

  return (
    <>
      <SectionHeading title="Denture Production & Payments" />
      <div className="mb-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card
          title="Denture Production by Warranty"
          subtitle="6-mo · 1-Yr · 3-Yr · 5-Yr"
        >
          <HBarChart rows={dentureWarrantyRows} />
        </Card>
        <Card
          title="Partial Production by Warranty"
          subtitle="6-mo · 1-Yr · 3-Yr · 5-Yr"
        >
          <HBarChart rows={partialWarrantyRows} />
        </Card>
        <Card
          title="Payment Mix"
          subtitle="Cash · Insurance · Financed · SoonerCare"
          className="md:col-span-2 lg:col-span-1"
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
  periodLabel,
}: {
  production: LiveProduction;
  periodLabel: string;
}) {
  const points = production.periodTrend;
  const series = [
    {
      label: "Production",
      values: points.map((point) => point.dollars),
      color: CHANNEL_COLORS[0],
    },
  ];

  return (
    <>
      <SectionHeading title="Production Trend" />
      <div className="mb-4 min-w-0">
        <Card
          title="Production"
          subtitle={`${periodLabel} · hover for detail`}
          className="min-w-0 overflow-hidden"
        >
          <LineChart
            series={series}
            xLabels={points.map((point) => point.label)}
            money
          />
        </Card>
      </div>
    </>
  );
}
