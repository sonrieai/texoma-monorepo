import Link from "next/link";
import { Card } from "@/components/ui/Cards";
import {
  COCKPIT_DISPLAY_CATEGORY_NAMES,
  COCKPIT_OTHER_CATEGORY,
  type CockpitProviderCategoryCounts,
} from "@/lib/charts/cockpit-display-categories";
import {
  centsToDollars,
  formatCount,
  formatUsd,
  formatUsdFromCentsOrDash,
} from "@/lib/metrics";

/** Short table headers for wide category columns. */
const CATEGORY_HEADER_LABELS: Record<
  (typeof COCKPIT_DISPLAY_CATEGORY_NAMES)[number],
  string
> = {
  Dentures: "Dentures",
  Extractions: "Extractions",
  Hygiene: "Hygiene",
  Implants: "Implants",
  "Partial Dentures": "Partials",
  "Restorative Dentistry": "Restorative",
  [COCKPIT_OTHER_CATEGORY]: "Other",
};

const TRAILING_METRICS = [
  { key: "arches" as const, label: "Arches" },
  { key: "npConsultShow" as const, label: "NP seen" },
  { key: "sameDayNp" as const, label: "Same-day NP" },
] as const;

export type DoctorProviderRow = {
  id: string;
  name: string;
  grossProductionCents: number;
  categoryCounts: CockpitProviderCategoryCounts;
  arches: number;
  npConsultShow: number;
  sameDayNp: number;
};

const TRAILING_HEADERS = [
  "Arches",
  "NP seen",
  "Same-day NP",
  "$ / patient",
] as const;

function formatTrailingValue(
  key: (typeof TRAILING_METRICS)[number]["key"],
  row: DoctorProviderRow,
  productionAvailable: boolean,
): string {
  if (key === "arches") return formatCount(row.arches, productionAvailable);
  if (key === "npConsultShow") {
    return row.npConsultShow > 0 || productionAvailable
      ? String(row.npConsultShow)
      : "—";
  }
  return row.sameDayNp > 0 || productionAvailable
    ? String(row.sameDayNp)
    : "—";
}

function ProviderMobileCard({
  provider: p,
  productionAvailable,
}: {
  provider: DoctorProviderRow;
  productionAvailable: boolean;
}) {
  const perPatient =
    p.npConsultShow > 0
      ? centsToDollars(p.grossProductionCents) / p.npConsultShow
      : null;

  return (
    <article className="border-b border-line px-3 py-3.5 last:border-b-0 sm:px-4">
      <div className="flex items-start justify-between gap-3">
        <Link
          href={`/doctor/${p.id}`}
          className="min-w-0 truncate font-bold text-foreground no-underline hover:text-accent hover:underline"
        >
          {p.name}
        </Link>
        <span className="shrink-0 text-[17px] font-extrabold tabular-nums">
          {formatUsdFromCentsOrDash(
            p.grossProductionCents,
            productionAvailable,
          )}
        </span>
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2.5 min-[400px]:grid-cols-3">
        {COCKPIT_DISPLAY_CATEGORY_NAMES.map((category) => (
          <div key={category} className="min-w-0">
            <dt className="truncate text-[10px] font-semibold uppercase tracking-wide text-muted">
              {CATEGORY_HEADER_LABELS[category]}
            </dt>
            <dd className="mt-0.5 text-[15px] font-extrabold tabular-nums">
              {formatCount(p.categoryCounts[category], productionAvailable)}
            </dd>
          </div>
        ))}
        {TRAILING_METRICS.map(({ key, label }) => (
          <div key={key} className="min-w-0">
            <dt className="truncate text-[10px] font-semibold uppercase tracking-wide text-muted">
              {label}
            </dt>
            <dd className="mt-0.5 text-[15px] font-extrabold tabular-nums">
              {formatTrailingValue(key, p, productionAvailable)}
            </dd>
          </div>
        ))}
        <div className="min-w-0">
          <dt className="truncate text-[10px] font-semibold uppercase tracking-wide text-muted">
            $ / patient
          </dt>
          <dd className="mt-0.5 text-[15px] font-extrabold tabular-nums">
            {perPatient != null && productionAvailable
              ? formatUsd(perPatient)
              : "—"}
          </dd>
        </div>
      </dl>
    </article>
  );
}

export function DoctorProviderTable({
  providers,
  productionAvailable = false,
}: {
  providers: DoctorProviderRow[];
  productionAvailable?: boolean;
}) {
  return (
    <Card className="overflow-hidden p-0 sm:p-0">
      {/* Mobile / tablet: stacked provider cards */}
      <div className="lg:hidden">
        {providers.map((p) => (
          <ProviderMobileCard
            key={p.id}
            provider={p}
            productionAvailable={productionAvailable}
          />
        ))}
      </div>

      {/* Desktop: full table with horizontal scroll fallback */}
      <div className="hidden lg:block">
        <p className="sr-only">
          Wide table — scroll horizontally if needed.
        </p>
        <div className="overflow-x-auto">
          <table className="provtbl w-full min-w-[1040px] border-collapse text-[12.5px]">
            <thead>
              <tr>
                <th className="border-b border-line px-1.5 py-2 pl-3 text-left text-[10.5px] font-semibold uppercase tracking-wide text-muted">
                  Provider
                </th>
                <th className="border-b border-line px-1.5 py-2 text-center text-[10.5px] font-semibold uppercase tracking-wide text-muted">
                  Production
                </th>
                {COCKPIT_DISPLAY_CATEGORY_NAMES.map((category) => (
                  <th
                    key={category}
                    className="border-b border-line px-1 py-2 text-center text-[10.5px] font-semibold uppercase tracking-wide text-muted"
                  >
                    {CATEGORY_HEADER_LABELS[category]}
                  </th>
                ))}
                {TRAILING_HEADERS.map((h) => (
                  <th
                    key={h}
                    className="border-b border-line px-1.5 py-2 text-center text-[10.5px] font-semibold uppercase tracking-wide text-muted last:pr-3"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {providers.map((p) => {
                const perPatient =
                  p.npConsultShow > 0
                    ? centsToDollars(p.grossProductionCents) / p.npConsultShow
                    : null;
                return (
                  <tr key={p.id} className="hover:bg-background/80">
                    <td className="border-b border-line px-1.5 py-2.5 pl-3 text-left">
                      <Link
                        href={`/doctor/${p.id}`}
                        className="font-bold text-foreground no-underline hover:text-accent hover:underline"
                      >
                        {p.name}
                      </Link>
                    </td>
                    <td className="border-b border-line px-1.5 py-2.5 text-center tabular-nums whitespace-nowrap">
                      {formatUsdFromCentsOrDash(
                        p.grossProductionCents,
                        productionAvailable,
                      )}
                    </td>
                    {COCKPIT_DISPLAY_CATEGORY_NAMES.map((category) => (
                      <td
                        key={category}
                        className="border-b border-line px-1 py-2.5 text-center tabular-nums"
                      >
                        {formatCount(
                          p.categoryCounts[category],
                          productionAvailable,
                        )}
                      </td>
                    ))}
                    <td className="border-b border-line px-1.5 py-2.5 text-center tabular-nums">
                      {formatCount(p.arches, productionAvailable)}
                    </td>
                    <td className="border-b border-line px-1.5 py-2.5 text-center tabular-nums">
                      {p.npConsultShow > 0 || productionAvailable
                        ? String(p.npConsultShow)
                        : "—"}
                    </td>
                    <td className="border-b border-line px-1.5 py-2.5 text-center tabular-nums">
                      {p.sameDayNp > 0 || productionAvailable
                        ? String(p.sameDayNp)
                        : "—"}
                    </td>
                    <td className="border-b border-line px-1.5 py-2.5 pr-3 text-center tabular-nums whitespace-nowrap">
                      {perPatient != null && productionAvailable
                        ? formatUsd(perPatient)
                        : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </Card>
  );
}
