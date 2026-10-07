import type { ReactNode } from "react";
import { InlineSpinner } from "@/components/ui/States";

export type StatusBadgeVariant =
  | "live"
  | "offline"
  | "error"
  | "admin"
  | "loading";

const VARIANT_CLASS: Record<StatusBadgeVariant, string> = {
  live: "border-good/25 bg-good/10 text-good",
  offline: "border-badge-border bg-badge-bg text-accent2",
  error: "border-bad/25 bg-bad/10 text-bad",
  admin: "border-badge-border bg-badge-bg text-accent2",
  loading: "border-badge-border bg-badge-bg text-muted",
};

export function StatusBadge({
  variant,
  children,
  className,
}: {
  variant: StatusBadgeVariant;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex max-w-[11rem] shrink-0 items-center gap-1.5 truncate rounded-full border px-2.5 py-0.5 text-[10.5px] font-semibold leading-tight sm:max-w-none ${VARIANT_CLASS[variant]} ${className ?? ""}`}
    >
      {variant === "loading" ? (
        <InlineSpinner size="xs" className="shrink-0 border-muted/40 border-t-accent2" />
      ) : variant === "live" ? (
        <span
          className="h-1.5 w-1.5 shrink-0 rounded-full bg-good"
          aria-hidden
        />
      ) : variant === "offline" ? (
        <span
          className="h-1.5 w-1.5 shrink-0 rounded-full bg-muted"
          aria-hidden
        />
      ) : null}
      <span className="truncate">{children}</span>
    </span>
  );
}
