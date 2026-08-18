import type { ReactNode } from "react";
import { AppShell } from "@/components/shell/AppShell";

export function Spinner({
  label = "Loading…",
  size = "md",
}: {
  label?: string;
  size?: "sm" | "md";
}) {
  const dim = size === "sm" ? "h-5 w-5 border-2" : "h-7 w-7 border-[3px]";
  return (
    <div
      className="flex flex-col items-center justify-center gap-2.5 py-8"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <span
        className={`${dim} animate-spin rounded-full border-line border-t-accent2`}
        aria-hidden
      />
      <span className="text-[12.5px] text-muted">{label}</span>
    </div>
  );
}

export function EmptyState({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-line bg-card/60 px-4 py-8 text-center sm:px-6 sm:py-10">
      <p className="m-0 text-[13.5px] font-semibold text-foreground">{title}</p>
      {description ? (
        <p className="m-0 mt-1.5 max-w-md text-[12px] leading-relaxed text-muted">
          {description}
        </p>
      ) : null}
      {children ? <div className="mt-3">{children}</div> : null}
    </div>
  );
}

/** Shared route-level loading shell for App Router `loading.tsx`. */
export function PageLoading({
  title,
  label = "Loading live data…",
}: {
  title: string;
  label?: string;
}) {
  return (
    <AppShell title={title} badge="Loading">
      <Spinner label={label} />
    </AppShell>
  );
}
