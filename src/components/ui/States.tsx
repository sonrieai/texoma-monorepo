import type { ReactNode } from "react";
import { AppShell } from "@/components/shell/AppShell";

export function InlineSpinner({
  size = "sm",
  className,
}: {
  size?: "xs" | "sm" | "md";
  className?: string;
}) {
  const dim =
    size === "xs"
      ? "h-3.5 w-3.5 border-2"
      : size === "sm"
        ? "h-4 w-4 border-2"
        : "h-7 w-7 border-[3px]";
  return (
    <span
      className={`inline-block animate-spin rounded-full border-line border-t-accent2 ${dim} ${className ?? ""}`}
      aria-hidden
    />
  );
}

export function LoadingBox({ className }: { className?: string }) {
  return (
    <div
      className={`flex items-center justify-center ${className ?? ""}`}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <InlineSpinner size="md" />
    </div>
  );
}

export function Spinner({
  label,
  size = "md",
}: {
  label?: string;
  size?: "sm" | "md";
}) {
  return (
    <div
      className="flex flex-col items-center justify-center gap-2.5 py-8"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <InlineSpinner size={size} />
      {label ? (
        <span className="text-[12.5px] text-muted">{label}</span>
      ) : null}
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
  subtitle,
  label = "Loading…",
}: {
  title: string;
  subtitle?: string;
  label?: string;
}) {
  return (
    <AppShell title={title} subtitle={subtitle}>
      <Spinner label={label} />
    </AppShell>
  );
}
