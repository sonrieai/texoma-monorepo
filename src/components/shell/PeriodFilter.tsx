"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  DayCalendar,
  MonthCalendar,
  RangePicker,
} from "@/components/shell/PeriodFilterPickers";
import {
  parsePeriodParams,
  periodToSearchString,
  type PeriodMode,
  type PeriodState,
} from "@/lib/ui/period";

const MODES: { id: PeriodMode; label: string; shortLabel: string }[] = [
  { id: "daily", label: "Daily", shortLabel: "Day" },
  { id: "monthly", label: "Monthly", shortLabel: "Month" },
  { id: "range", label: "Date range", shortLabel: "Range" },
];

export function PeriodFilter() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const state = parsePeriodParams(searchParams);
  const [open, setOpen] = useState<PeriodMode | null>(null);
  const [calMonth, setCalMonth] = useState(state.day.slice(0, 7));
  const [calYear, setCalYear] = useState(Number(state.month.slice(0, 4)));
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setCalMonth(state.day.slice(0, 7));
    setCalYear(Number(state.month.slice(0, 4)));
  }, [state.day, state.month]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(null);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  const apply = (next: PeriodState, keepOpen?: PeriodMode) => {
    router.replace(`${pathname}?${periodToSearchString(next)}`, {
      scroll: false,
    });
    setOpen(keepOpen ?? null);
  };

  const selectMode = (mode: PeriodMode) => {
    apply({ ...state, mode }, mode);
  };

  return (
    <div
      ref={rootRef}
      className="inline-flex w-full max-w-full rounded-lg border border-line bg-card sm:w-auto"
    >
      {MODES.map((m) => {
        const active = state.mode === m.id;
        return (
          <div key={m.id} className="relative min-w-0 flex-1 sm:flex-none">
            <button
              type="button"
              aria-pressed={active}
              aria-expanded={open === m.id}
              aria-haspopup="dialog"
              onClick={() =>
                open === m.id ? setOpen(null) : selectMode(m.id)
              }
              className={`min-h-11 w-full min-w-0 px-2 text-[11px] font-semibold sm:min-h-9 sm:w-auto sm:min-w-[4.5rem] sm:px-3.5 sm:text-[13px] ${
                active
                  ? "bg-accent2 text-white"
                  : "bg-transparent text-foreground hover:bg-background"
              } ${m.id === "daily" ? "rounded-l-[7px]" : ""} ${
                m.id === "range" ? "rounded-r-[7px]" : ""
              } ${m.id !== "range" ? "border-r border-line" : ""}`}
            >
              <span className="sm:hidden">{m.shortLabel}</span>
              <span className="hidden sm:inline">{m.label}</span>
            </button>
            {open === m.id ? (
              <div
                role="dialog"
                aria-label={`${m.label} period`}
                className={`absolute top-full z-50 mt-2 max-w-[calc(100vw-1.75rem)] rounded-[11px] border border-line bg-card p-2.5 shadow-[0_12px_34px_rgba(0,0,0,0.16)] ${
                  m.id === "daily"
                    ? "left-0 sm:left-0"
                    : m.id === "monthly"
                      ? "left-1/2 -translate-x-1/2"
                      : "right-0 sm:right-0"
                }`}
              >
                {m.id === "daily" ? (
                  <DayCalendar
                    cursor={calMonth}
                    selected={state.day}
                    onCursor={setCalMonth}
                    onSelect={(day) => apply({ ...state, mode: "daily", day })}
                  />
                ) : null}
                {m.id === "monthly" ? (
                  <MonthCalendar
                    year={calYear}
                    selected={state.month}
                    onYear={setCalYear}
                    onSelect={(month) =>
                      apply({ ...state, mode: "monthly", month })
                    }
                  />
                ) : null}
                {m.id === "range" ? (
                  <RangePicker
                    from={state.from}
                    to={state.to}
                    onChange={(from, to) =>
                      apply({ ...state, mode: "range", from, to }, "range")
                    }
                  />
                ) : null}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

export function PeriodFilterFallback() {
  return (
    <div className="inline-flex rounded-lg border border-line bg-card">
      {MODES.map((m) => (
        <span
          key={m.id}
          className={`inline-flex min-h-11 min-w-[4.5rem] items-center justify-center px-2.5 text-[12px] font-semibold sm:min-h-9 sm:px-3.5 sm:text-[13px] ${
            m.id === "monthly" ? "bg-accent2 text-white" : "text-muted"
          } ${m.id !== "range" ? "border-r border-line" : ""}`}
        >
          {m.label}
        </span>
      ))}
    </div>
  );
}
