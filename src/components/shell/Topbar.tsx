"use client";

import type { ReactNode } from "react";
import { Suspense } from "react";
import { LogoutButton } from "@/components/auth/LogoutButton";
import {
  PeriodFilter,
  PeriodFilterFallback,
} from "@/components/shell/PeriodFilter";

type TopbarProps = {
  title: string;
  subtitle?: string;
  badge?: ReactNode;
  onMenuClick?: () => void;
};

export function Topbar({ title, subtitle, badge, onMenuClick }: TopbarProps) {
  return (
    <header className="sticky top-0 z-20 flex shrink-0 flex-col gap-2.5 border-b border-line bg-card/95 px-3.5 py-2.5 backdrop-blur sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-4 sm:px-6 sm:py-3">
      <div className="flex min-w-0 items-center gap-2.5">
        <button
          type="button"
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-line bg-background text-foreground lg:hidden"
          onClick={onMenuClick}
          aria-label="Open navigation"
        >
          <span aria-hidden className="text-lg leading-none">
            ☰
          </span>
        </button>
        <div className="min-w-0 flex-1">
          <h2 className="m-0 truncate text-base font-bold leading-tight text-foreground sm:text-lg">
            {title}
          </h2>
          {subtitle ? (
            <p className="m-0 mt-0.5 line-clamp-2 text-[11.5px] leading-snug text-muted sm:line-clamp-1 sm:text-[12px]">
              {subtitle}
            </p>
          ) : null}
        </div>
        {badge ? (
          <div className="shrink-0 sm:hidden">{badge}</div>
        ) : null}
      </div>

      <div className="flex w-full min-w-0 items-center gap-2 sm:w-auto sm:flex-none sm:justify-end">
        {badge ? (
          <div className="hidden shrink-0 sm:block">{badge}</div>
        ) : null}

        <div className="min-w-0 flex-1 sm:flex-none">
          <Suspense fallback={<PeriodFilterFallback />}>
            <PeriodFilter />
          </Suspense>
        </div>

        <div
          className="hidden h-7 w-px shrink-0 bg-line sm:block"
          aria-hidden
        />

        <LogoutButton variant="topbar" />
      </div>
    </header>
  );
}
