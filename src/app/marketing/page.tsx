import Link from "next/link";
import { AppShell } from "@/components/shell/AppShell";
import { FunnelChart } from "@/components/charts/FunnelChart";
import { HBarChart } from "@/components/charts/DonutChart";
import { Card, ComboStat, SectionHeading } from "@/components/ui/Cards";
import { EmptyState } from "@/components/ui/States";
import { formatPct, formatUsd } from "@/lib/metrics";
import {
  isGhlConfigured,
  loadMarketingSummary,
  type AdChannel,
  type MarketingScoreItem,
} from "@/lib/ghl/client";
import { loadLiveOverview } from "@/lib/nexhealth/live";
import { rangeFromSearchParams } from "@/lib/ui/period";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function channelRoi(c: AdChannel): string {
  if (!c.spend) return "—";
  return `${(c.production / c.spend).toFixed(1)}x`;
}

function channelCpl(c: AdChannel): string {
  if (!c.spend || !c.leads) return "—";
  return formatUsd(c.spend / c.leads);
}

function channelCostPerArch(c: AdChannel): string {
  if (!c.spend || !c.surgery) return "—";
  return formatUsd(c.spend / c.surgery);
}

function Scorecard({ items }: { items: MarketingScoreItem[] }) {
  return (
    <div className="space-y-2.5">
      {items.map((s) => (
        <div
          key={s.label}
          className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-2 last:border-0 last:pb-0"
        >
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold text-white ${
                s.pass === true
                  ? "bg-good"
                  : s.pass === false
                    ? "bg-bad"
                    : "bg-muted"
              }`}
              aria-hidden
            >
              {s.pass === true ? "✓" : s.pass === false ? "✕" : "·"}
            </span>
            <b className="text-[13px]">{s.label}</b>
          </div>
          <div className="text-[12px]">
            <span
              className={`mr-2 rounded-full px-2 py-0.5 font-semibold tabular-nums ${
                s.pass === true
                  ? "bg-good/15 text-good"
                  : s.pass === false
                    ? "bg-bad/15 text-bad"
                    : "bg-background text-muted"
              }`}
            >
              {s.show}
            </span>
            <span className="text-muted">goal {s.goal}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

export default async function MarketingPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const period = rangeFromSearchParams(params);

  let error: string | null = null;
  let data: Awaited<ReturnType<typeof loadLiveOverview>> | null = null;

  try {
    data = await loadLiveOverview(period.start, period.end);
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to load data";
  }

  const ghlReady = await isGhlConfigured();
  const marketing = await loadMarketingSummary({
    startYmd: period.start.slice(0, 10),
    endYmd: period.end.slice(0, 10),
  });

  if (error || !data) {
    return (
      <AppShell title="Marketing" subtitle="Marketing" badge="Error">
        <EmptyState
          title="Unable to load marketing context"
          description={error ?? ""}
        />
      </AppShell>
    );
  }

  const conv = data.conversion;
  const consultShowRate =
    conv.npConsultShowRate != null ? conv.npConsultShowRate : data.showRate;
  const t = marketing.totals;
  const lookbackNote = `last ${marketing.lookbackDays}d`;

  return (
    <AppShell
      title="Marketing"
      subtitle="Spend, ROI, and attribution"
      badge={ghlReady ? "Live" : "Pending"}
    >
      <SectionHeading title="Cockpit" />
      <div className="mb-4 grid grid-cols-2 items-stretch gap-2.5 md:grid-cols-4">
        <ComboStat
          label="Total ad spend"
          value={t.spend > 0 ? formatUsd(t.spend) : "—"}
          note={
            t.spend > 0
              ? `paid channels · ${lookbackNote}`
              : "ad spend not connected yet"
          }
        />
        <ComboStat
          label="Marketing ROI"
          value={marketing.roi != null ? `${marketing.roi.toFixed(1)}x` : "—"}
          note="production ÷ spend · target ≥10x"
          status={
            marketing.roi == null
              ? "neutral"
              : marketing.roi >= 10
                ? "good"
                : marketing.roi >= 6
                  ? "warn"
                  : "bad"
          }
        />
        <ComboStat
          label="Cost / arch"
          value={
            marketing.costPerArch != null
              ? formatUsd(marketing.costPerArch)
              : "—"
          }
          note="goal <$700"
          status={
            marketing.costPerArch == null
              ? "neutral"
              : marketing.costPerArch < 700
                ? "good"
                : marketing.costPerArch < 1500
                  ? "warn"
                  : "bad"
          }
        />
        <ComboStat
          label="Consult show rate"
          value={formatPct(
            marketing.showRate != null ? marketing.showRate : consultShowRate,
          )}
          note={
            marketing.showRate != null
              ? `Booked → showed · ${lookbackNote}`
              : "NP consult or practice-wide"
          }
          status={
            (marketing.showRate ?? consultShowRate) >= 0.75
              ? "good"
              : (marketing.showRate ?? consultShowRate) >= 0.65
                ? "warn"
                : "neutral"
          }
        />
      </div>

      <SectionHeading title="Practice context" />
      <div className="mb-4 grid grid-cols-2 items-stretch gap-2.5 md:grid-cols-4">
        <ComboStat
          label="NP consult shows"
          value={String(conv.npConsultShow)}
        />
        <ComboStat
          label="Same-day starts"
          value={
            conv.sameDayStartRate != null
              ? formatPct(conv.sameDayStartRate)
              : "—"
          }
          note={`${conv.sameDayStarts} starts · target ≥30%`}
        />
        <ComboStat label="Practice show rate" value={formatPct(data.showRate)} />
        <ComboStat
          label="Total appointments"
          value={String(data.appointments.total)}
        />
      </div>

      <SectionHeading title="Spend & funnel by channel" />
      {!ghlReady ? (
        <EmptyState
          title="Marketing channels not connected"
          description="Add your GoHighLevel API key and Location ID in Settings to show leads, funnel, and referral sources."
        >
          <Link
            href="/settings/ghl"
            className="inline-flex min-h-9 items-center rounded-lg bg-accent2 px-4 py-2 text-[12.5px] font-semibold text-white transition hover:opacity-95"
          >
            Configure GoHighLevel
          </Link>
        </EmptyState>
      ) : !marketing.available && marketing.channels.length === 0 ? (
        <EmptyState
          title="No opportunities in range"
          description={
            marketing.notices[0] ??
            `No Call Center / Appointment opportunities in the last ${marketing.lookbackDays} days.`
          }
        />
      ) : (
        <>
          <Card
            title="Channel performance"
            subtitle={`${marketing.opportunityCount} opportunities · ${lookbackNote} · spend blank until ads sync`}
            className="mb-4 overflow-x-auto"
          >
            <table className="w-full min-w-[880px] border-collapse text-[12.5px]">
              <thead>
                <tr>
                  {[
                    "Channel",
                    "Spend",
                    "Leads",
                    "Booked",
                    "Showed",
                    "Accepted",
                    "Surgery",
                    "Production",
                    "$/lead",
                    "$/arch",
                    "ROI",
                  ].map((h) => (
                    <th
                      key={h}
                      className="border-b border-line px-2 py-1.5 text-center text-[10.5px] font-semibold uppercase tracking-wide text-muted first:text-left"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {marketing.channels.map((c) => (
                  <tr key={c.name} className="hover:bg-background/80">
                    <td className="border-b border-line px-2 py-2 text-left font-semibold">
                      {c.name}
                    </td>
                    <td className="border-b border-line px-2 py-2 text-center tabular-nums">
                      {c.spend > 0 ? formatUsd(c.spend) : "—"}
                    </td>
                    <td className="border-b border-line px-2 py-2 text-center tabular-nums">
                      {c.leads}
                    </td>
                    <td className="border-b border-line px-2 py-2 text-center tabular-nums">
                      {c.booked}
                    </td>
                    <td className="border-b border-line px-2 py-2 text-center tabular-nums">
                      {c.showed}
                    </td>
                    <td className="border-b border-line px-2 py-2 text-center tabular-nums">
                      {c.accepted}
                    </td>
                    <td className="border-b border-line px-2 py-2 text-center tabular-nums">
                      {c.surgery}
                    </td>
                    <td className="border-b border-line px-2 py-2 text-center tabular-nums">
                      {c.production > 0 ? formatUsd(c.production) : "—"}
                    </td>
                    <td className="border-b border-line px-2 py-2 text-center tabular-nums">
                      {channelCpl(c)}
                    </td>
                    <td className="border-b border-line px-2 py-2 text-center tabular-nums">
                      {channelCostPerArch(c)}
                    </td>
                    <td className="border-b border-line px-2 py-2 text-center tabular-nums">
                      {channelRoi(c)}
                    </td>
                  </tr>
                ))}
                <tr className="bg-background/60 font-semibold">
                  <td className="border-b border-line px-2 py-2">Total</td>
                  <td className="border-b border-line px-2 py-2 text-center tabular-nums">
                    {t.spend > 0 ? formatUsd(t.spend) : "—"}
                  </td>
                  <td className="border-b border-line px-2 py-2 text-center tabular-nums">
                    {t.leads}
                  </td>
                  <td className="border-b border-line px-2 py-2 text-center tabular-nums">
                    {t.booked}
                  </td>
                  <td className="border-b border-line px-2 py-2 text-center tabular-nums">
                    {t.showed}
                  </td>
                  <td className="border-b border-line px-2 py-2 text-center tabular-nums">
                    {t.accepted}
                  </td>
                  <td className="border-b border-line px-2 py-2 text-center tabular-nums">
                    {t.surgery}
                  </td>
                  <td className="border-b border-line px-2 py-2 text-center tabular-nums">
                    {t.production > 0 ? formatUsd(t.production) : "—"}
                  </td>
                  <td className="border-b border-line px-2 py-2 text-center tabular-nums">
                    {marketing.costPerLead != null
                      ? formatUsd(marketing.costPerLead)
                      : "—"}
                  </td>
                  <td className="border-b border-line px-2 py-2 text-center tabular-nums">
                    {marketing.costPerArch != null
                      ? formatUsd(marketing.costPerArch)
                      : "—"}
                  </td>
                  <td className="border-b border-line px-2 py-2 text-center tabular-nums">
                    {marketing.roi != null
                      ? `${marketing.roi.toFixed(1)}x`
                      : "—"}
                  </td>
                </tr>
              </tbody>
            </table>
          </Card>

          <SectionHeading title="Where we win & lose" />
          <div className="mb-4 grid gap-3 lg:grid-cols-2">
            <Card title="Acquisition funnel" subtitle="All channels combined">
              <FunnelChart
                stages={[
                  { label: "Leads", value: t.leads },
                  { label: "Booked", value: t.booked },
                  { label: "Showed", value: t.showed },
                  { label: "Accepted", value: t.accepted },
                  { label: "Surgery", value: t.surgery },
                ]}
              />
            </Card>
            <Card
              title="Production by source"
              subtitle="Opportunity monetary value by attribution"
            >
              {marketing.channels.some((c) => c.production > 0) ? (
                <HBarChart
                  rows={marketing.channels
                    .filter((c) => c.production > 0)
                    .map((c) => ({ label: c.name, value: c.production }))
                    .sort((a, b) => b.value - a.value)
                    .slice(0, 8)}
                />
              ) : (
                <p className="m-0 text-[12px] text-muted">
                  No monetary values on opportunities yet — production bars fill
                  when deals have dollar amounts in the CRM.
                </p>
              )}
            </Card>
          </div>

          <SectionHeading title="Top referral sources" />
          <div className="mb-4 grid gap-3 lg:grid-cols-2">
            <Card
              title="By new patients"
              subtitle={`Attribution source · ${lookbackNote}`}
            >
              <table className="w-full border-collapse text-[12.5px]">
                <thead>
                  <tr>
                    {["Referral source", "Patients", "Production"].map((h) => (
                      <th
                        key={h}
                        className="border-b border-line px-2 py-1.5 text-center text-[10.5px] font-semibold uppercase tracking-wide text-muted first:text-left"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {marketing.referralSources.slice(0, 10).map((r) => (
                    <tr key={r.source}>
                      <td className="border-b border-line px-2 py-2 font-semibold">
                        {r.source}
                      </td>
                      <td className="border-b border-line px-2 py-2 text-center tabular-nums">
                        {r.newPatients}
                      </td>
                      <td className="border-b border-line px-2 py-2 text-center tabular-nums">
                        {r.production > 0 ? formatUsd(r.production) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
            <Card title="Marketing scorecard" subtitle="Live vs goals">
              <Scorecard items={marketing.scorecard} />
              <p className="mb-0 mt-3 text-[11px] text-muted">
                Lead response time needs conversation timestamps (not wired
                yet). ROI/cost-per-arch need ad spend.
              </p>
            </Card>
          </div>
        </>
      )}

      {marketing.notices.length > 0 && ghlReady ? (
        <p className="m-0 text-[11.5px] text-muted">
          {marketing.notices.join(" ")}
        </p>
      ) : null}
    </AppShell>
  );
}
