import type { ReactNode } from "react";

export function SectionHeading({
  title,
  tag,
}: {
  title: string;
  tag?: string;
}) {
  return (
    <div className="mb-2.5 mt-5 flex flex-wrap items-center gap-2 first:mt-0">
      <h3 className="font-display m-0 text-[17px] font-semibold leading-tight tracking-normal text-foreground sm:text-[19px]">
        {title}
      </h3>
      <div className="hidden h-px min-w-[1.5rem] flex-1 bg-line sm:block" />
      {tag ? (
        <span className="max-w-full truncate rounded-full border border-line bg-card px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted">
          {tag}
        </span>
      ) : null}
    </div>
  );
}

export function Card({
  title,
  subtitle,
  children,
  className = "",
}: {
  title?: string;
  subtitle?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-xl border border-line bg-card p-3.5 transition-shadow hover:border-accent/30 hover:shadow-[0_8px_20px_rgba(15,49,64,0.06)] sm:p-4 ${className}`}
    >
      {title ? (
        <h3 className="m-0 mb-0.5 text-[13px] font-bold leading-snug">{title}</h3>
      ) : null}
      {subtitle ? (
        <p className="m-0 mb-2.5 text-[11.5px] leading-snug text-muted">
          {subtitle}
        </p>
      ) : null}
      {children}
    </div>
  );
}

export function StatusDot({
  status,
}: {
  status: "good" | "warn" | "bad" | "neutral";
}) {
  const color =
    status === "good"
      ? "bg-good"
      : status === "warn"
        ? "bg-warn"
        : status === "bad"
          ? "bg-bad"
          : "bg-muted";
  return <span className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${color}`} />;
}

/** Self-contained KPI tile — use directly in grids (no wrapping Card).
 *  `variant="inset"` for stats nested inside a Card. */
export function ComboStat({
  label,
  value,
  note,
  target,
  status,
  variant = "tile",
  size = "default",
}: {
  label: string;
  value: string;
  note?: string;
  /** Mockup KPI target line (e.g. "≥30%") — shown instead of note when set. */
  target?: string;
  status?: "good" | "warn" | "bad" | "neutral";
  variant?: "tile" | "inset";
  size?: "default" | "lg";
}) {
  const showStatus = status === "good" || status === "warn" || status === "bad";
  const meta = target ?? note;
  const edge =
    status === "good"
      ? "bg-good"
      : status === "warn"
        ? "bg-warn"
        : status === "bad"
          ? "bg-bad"
          : "";

  const shell =
    variant === "tile"
      ? size === "lg"
        ? "rounded-[14px] border border-line bg-card px-4 py-4 pl-[18px] min-h-[88px] sm:min-h-[92px]"
        : "rounded-xl border border-line bg-card px-3 py-2.5 pl-3.5 sm:min-h-[76px] sm:px-3.5 sm:py-3 sm:pl-4 min-h-[72px]"
      : "rounded-lg bg-background px-2.5 py-2 pl-3 min-h-[56px]";

  return (
    <div className={`relative flex h-full flex-col justify-center ${shell}`}>
      {showStatus ? (
        <span
          className={`absolute bottom-1.5 left-0 top-1.5 w-[3px] rounded-r ${edge}`}
          aria-hidden
        />
      ) : null}
      <div
        className={
          variant === "inset"
            ? "text-[11px] font-semibold text-muted"
            : "text-[10.5px] font-semibold uppercase tracking-wide text-muted sm:text-[11px]"
        }
      >
        {label}
      </div>
      <div
        className={
          size === "lg"
            ? "mt-1 text-[22px] font-extrabold leading-none tracking-tight tabular-nums sm:text-[26px]"
            : "mt-0.5 text-[17px] font-extrabold leading-none tracking-tight tabular-nums sm:text-[19px]"
        }
      >
        {value}
      </div>
      {meta ? (
        <div className="mt-1.5 flex items-center gap-1.5 text-[11.5px] leading-snug text-muted">
          {showStatus ? <StatusDot status={status} /> : null}
          <span className="line-clamp-2">{meta}</span>
        </div>
      ) : null}
    </div>
  );
}

export function NoticeList({ notices }: { notices: string[] }) {
  const visible = notices.filter(
    (n) =>
      !/\b(nexhealth|mongodb|mongo\b|warehouse|ghl_api|ghl_location|sync:nexhealth|leadconnector|cdt-categories)\b/i.test(
        n,
      ),
  );
  if (!visible.length) return null;
  return (
    <div className="mb-3 space-y-1.5">
      {visible.map((n) => (
        <div
          key={n}
          className="flex items-start gap-2 rounded-lg border border-notice-border bg-notice-bg px-2.5 py-1.5 text-[11.5px] leading-snug text-accent"
        >
          <span aria-hidden className="mt-px shrink-0">
            ℹ
          </span>
          <span>{n}</span>
        </div>
      ))}
    </div>
  );
}

/** Two-row label/value block inside a combo card (mockup `comboDuo`). */
export function ComboDuo({
  items,
}: {
  items: { label: string; value: string }[];
}) {
  return (
    <div className="relative rounded-lg bg-background px-2.5 py-2 sm:px-3.5">
      <div className="flex flex-col">
        {items.map((item, i) => (
          <div
            key={item.label}
            className={`flex items-baseline justify-between gap-2 py-1.5 sm:gap-3 ${
              i > 0 ? "border-t border-line" : ""
            }`}
          >
            <span className="min-w-0 flex-1 text-[11px] font-semibold leading-snug text-muted sm:text-[11.5px]">
              {item.label}
            </span>
            <b className="shrink-0 text-right text-[15px] font-extrabold tabular-nums tracking-tight sm:text-base">
              {item.value}
            </b>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Consistent section stack spacing for page content blocks. */
export function Section({ children }: { children: ReactNode }) {
  return <section className="mb-4 last:mb-0">{children}</section>;
}
