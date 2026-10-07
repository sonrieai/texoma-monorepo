"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { InlineSpinner } from "@/components/ui/States";
import {
  DayCalendar,
  MonthCalendar,
  YearPicker,
} from "@/components/shell/PeriodFilterPickers";
import {
  parsePeriodParams,
  periodLabel,
  periodToSearchString,
  type PeriodMode,
  type PeriodState,
} from "@/lib/ui/period";

const MODES: { id: Exclude<PeriodMode, "range">; label: string }[] = [
  { id: "daily", label: "Daily" },
  { id: "monthly", label: "Monthly" },
  { id: "yearly", label: "Yearly" },
];

export function PeriodFilter() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const state = parsePeriodParams(searchParams);
  const [open, setOpen] = useState<Exclude<PeriodMode, "range"> | null>(null);
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

  const apply = (next: PeriodState, keepOpen?: Exclude<PeriodMode, "range">) => {
    startTransition(() => {
      router.replace(`${pathname}?${periodToSearchString(next)}`, {
        scroll: false,
      });
    });
    setOpen(keepOpen ?? null);
  };

  const selectMode = (mode: Exclude<PeriodMode, "range">) => {
    if (state.mode === mode) {
      setOpen((current) => (current === mode ? null : mode));
      return;
    }
    apply({ ...state, mode }, mode);
  };

  return (
    <div ref={rootRef} className="w-full min-w-0 sm:w-auto">
      <div
        className={`relative flex w-full max-w-full rounded-lg border border-line bg-card transition-opacity ${isPending ? "opacity-75" : ""}`}
        aria-busy={isPending}
      >
        {isPending ? (
          <span className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-card/40">
            <InlineSpinner size="sm" aria-hidden />
          </span>
        ) : null}
        {MODES.map((m) => {
          const active = state.mode === m.id;
          return (
            <div key={m.id} className="relative min-w-0 flex-1 sm:flex-none">
              <button
                type="button"
                disabled={isPending}
                aria-pressed={active}
                aria-expanded={open === m.id}
                aria-haspopup="dialog"
                onClick={() => selectMode(m.id)}
                className={`min-h-11 w-full min-w-0 px-1.5 text-[11px] font-semibold disabled:cursor-wait sm:min-h-9 sm:w-auto sm:min-w-[5.25rem] sm:px-3.5 sm:text-[13px] ${
                  active
                    ? "bg-accent2 text-white"
                    : "bg-transparent text-foreground hover:bg-background"
                } ${m.id === "daily" ? "rounded-l-[7px]" : ""} ${
                  m.id === "yearly" ? "rounded-r-[7px]" : ""
                } ${m.id !== "yearly" ? "border-r border-line" : ""}`}
              >
                {m.label}
              </button>
              {open === m.id ? (
                <div
                  role="dialog"
                  aria-label={`${m.label} period`}
                  className={`absolute top-full z-50 mt-2 max-w-[calc(100vw-1.75rem)] rounded-[11px] border border-line bg-card p-2.5 shadow-[0_12px_34px_rgba(0,0,0,0.16)] ${
                    m.id === "yearly"
                      ? "right-0"
                      : m.id === "monthly"
                        ? "left-1/2 -translate-x-1/2 max-[420px]:left-0 max-[420px]:translate-x-0"
                        : "left-0"
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
                  {m.id === "yearly" ? (
                    <YearPicker
                      selected={state.year}
                      onSelect={(year) =>
                        apply({ ...state, mode: "yearly", year })
                      }
                    />
                  ) : null}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
      <p className="m-0 mt-1 flex items-center justify-center gap-1.5 truncate text-center text-[11px] font-semibold text-muted sm:justify-end sm:text-right">
        {isPending ? (
          <>
            <InlineSpinner size="xs" className="shrink-0 border-muted/40 border-t-accent2" />
            <span>Updating…</span>
          </>
        ) : (
          periodLabel(state)
        )}
      </p>
    </div>
  );
}

export function PeriodFilterFallback() {
  return (
    <div className="w-full min-w-0 sm:w-auto">
      <div
        className="relative flex w-full max-w-full rounded-lg border border-line bg-card"
        role="status"
        aria-live="polite"
        aria-busy="true"
      >
        <span className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-card/50">
          <InlineSpinner size="sm" />
        </span>
        {MODES.map((m) => (
          <span
            key={m.id}
            className={`inline-flex min-h-11 min-w-0 flex-1 items-center justify-center px-1.5 text-[11px] font-semibold sm:min-h-9 sm:min-w-[5.25rem] sm:flex-none sm:px-3.5 sm:text-[13px] ${
              m.id === "yearly" ? "bg-accent2/90 text-white" : "text-muted/80"
            } ${m.id !== "yearly" ? "border-r border-line" : ""}`}
          >
            {m.label}
          </span>
        ))}
      </div>
      <p className="m-0 mt-1 flex items-center justify-center gap-1.5 text-[11px] font-semibold text-muted sm:justify-end">
        <InlineSpinner size="xs" className="border-muted/40 border-t-accent2" />
        Loading period…
      </p>
    </div>
  );
}
