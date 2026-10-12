import type { ReactNode } from "react";

export function SectionHeading({
  title,
  tag,
}: {
  title: string;
  tag?: string;
}) {
  return (
    <div className="mb-3 mt-[26px] flex flex-wrap items-center gap-2.5 first:mt-0">
      <h3 className="font-display m-0 text-[23px] font-semibold leading-tight tracking-normal text-foreground">
        {title}
      </h3>
      <div className="hidden h-px min-w-[1.5rem] flex-1 bg-line sm:block" />
      {tag ? (
        <span className="max-w-full truncate rounded-[20px] border border-line bg-background px-[9px] py-0.5 text-[10.5px] font-semibold text-muted">
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
      className={`rounded-[14px] border border-line bg-card p-[18px] ${className}`}
    >
      {title ? (
        <h3 className="m-0 mb-[3px] text-[13.5px] font-bold leading-snug">{title}</h3>
      ) : null}
      {subtitle ? (
        <p className="m-0 mb-3.5 text-[11.5px] leading-snug text-muted">
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
  return <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${color}`} />;
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
  size: _size = "default",
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
      ? "overflow-hidden rounded-[14px] border border-line bg-card px-[17px] py-4"
      : "rounded-[10px] bg-background px-3.5 py-[9px]";

  const edgeClass =
    variant === "tile"
      ? "absolute bottom-0 left-0 top-0 w-1"
      : "absolute bottom-[9px] left-0 top-[9px] w-1 rounded";

  return (
    <div className={`relative flex h-full flex-col justify-center ${shell}`}>
      {showStatus ? (
        <span className={`${edgeClass} ${edge}`} aria-hidden />
      ) : null}
      <div
        className={
          variant === "inset"
            ? "text-[11px] font-semibold text-muted"
            : "mb-2 text-[11.5px] font-semibold text-muted"
        }
      >
        {label}
      </div>
      <div
        className={
          variant === "inset"
            ? "mt-0.5 text-[21px] font-extrabold leading-none tracking-[-0.5px] tabular-nums"
            : "text-[26px] font-extrabold leading-none tracking-[-0.5px] tabular-nums"
        }
      >
        {value}
      </div>
      {meta ? (
        <div
          className={
            variant === "inset"
              ? "mt-1 flex items-center gap-[5px] text-[11px] leading-snug text-muted"
              : "mt-1.5 flex items-center gap-1.5 text-[11.5px] leading-snug text-muted"
          }
        >
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
      !/\b(mongodb|mongo\b|warehouse|ghl_api|ghl_location|leadconnector|cdt-categories)\b/i.test(
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
    <div className="relative rounded-[10px] bg-background px-3.5 py-[9px]">
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
