"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { InlineSpinner } from "@/components/ui/States";
import {
  DateRangePanel,
  initialCalendarCursor,
} from "@/components/shell/PeriodFilterPickers";
import {
  RANGE_PRESETS,
  matchRangePreset,
  parsePeriodParams,
  periodLabel,
  periodToRange,
  periodToSearchString,
  resolveRangePreset,
  todayYmd,
  type PeriodState,
  type RangePresetId,
} from "@/lib/ui/period";

function rangeSummary(from: string, to: string): string {
  return periodLabel({
    mode: "range",
    from,
    to,
    day: from,
    month: from.slice(0, 7),
    year: from.slice(0, 4),
  });
}

function presetLabel(id: RangePresetId): string {
  return RANGE_PRESETS.find((preset) => preset.id === id)?.label ?? "Custom";
}

function CalendarIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      className="h-4 w-4 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="2.5" y="3.5" width="15" height="14" rx="2" />
      <path d="M2.5 8h15M6.5 2.5v3M13.5 2.5v3" />
    </svg>
  );
}

export function PeriodFilter() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const state = parsePeriodParams(searchParams);
  const applied = periodToRange(state);
  const appliedPreset = matchRangePreset(applied.start, applied.end);
  const exactLabel = rangeSummary(applied.start, applied.end);

  const [open, setOpen] = useState(false);
  const [preset, setPreset] = useState<RangePresetId | "custom">(appliedPreset);
  const [from, setFrom] = useState(applied.start);
  const [to, setTo] = useState(applied.end);
  const [cursor, setCursor] = useState(() =>
    initialCalendarCursor(applied.start, applied.end),
  );
  const [awaitingEnd, setAwaitingEnd] = useState(false);
  const [panelPos, setPanelPos] = useState<{ top: number; right: number; width: number } | null>(
    null,
  );
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const loadDraft = (nextFrom: string, nextTo: string) => {
    setFrom(nextFrom);
    setTo(nextTo);
    setPreset(matchRangePreset(nextFrom, nextTo));
    setCursor(initialCalendarCursor(nextFrom, nextTo));
    setAwaitingEnd(false);
  };

  useEffect(() => {
    if (!open) return;
    const place = () => {
      const rect = rootRef.current?.getBoundingClientRect();
      if (!rect) return;
      const margin = 12;
      const width = Math.min(
        preset === "custom" ? 680 : 256,
        window.innerWidth - margin * 2,
      );
      let right = window.innerWidth - rect.right;
      const maxRight = window.innerWidth - margin - width;
      if (right > maxRight) right = maxRight;
      if (right < margin) right = margin;
      setPanelPos({ top: rect.bottom + 8, right, width });
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [open, preset]);

  useEffect(() => {
    const onDoc = (event: MouseEvent) => {
      const target = event.target as Node;
      if (rootRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  const apply = (next: PeriodState) => {
    startTransition(() => {
      router.replace(`${pathname}?${periodToSearchString(next)}`, {
        scroll: false,
      });
    });
  };

  const toggle = () => {
    if (open) {
      setOpen(false);
      return;
    }
    loadDraft(applied.start, applied.end);
    setOpen(true);
  };

  const choosePreset = (id: RangePresetId) => {
    const range = resolveRangePreset(id);
    setPreset(id);
    setFrom(range.from);
    setTo(range.to);
    setCursor(initialCalendarCursor(range.from, range.to));
    setAwaitingEnd(false);
  };

  const pickDay = (ymd: string) => {
    setPreset("custom");
    if (!awaitingEnd) {
      setFrom(ymd);
      setTo(ymd);
      setAwaitingEnd(true);
      return;
    }
    const start = ymd < from ? ymd : from;
    const end = ymd < from ? from : ymd;
    setFrom(start);
    setTo(end);
    setAwaitingEnd(false);
  };

  const done = () => {
    const start = from <= to ? from : to;
    const end = from <= to ? to : from;
    apply({ ...state, mode: "range", from: start, to: end });
    setOpen(false);
  };

  const buttonLabel = appliedPreset === "custom" ? exactLabel : presetLabel(appliedPreset);

  return (
    <div ref={rootRef} className="relative w-full min-w-0 sm:w-auto">
      <button
        type="button"
        disabled={isPending}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={toggle}
        className={`flex min-h-11 w-full min-w-0 items-center gap-2 rounded-lg border bg-card px-3 text-left transition-colors disabled:cursor-wait sm:min-h-9 sm:w-auto sm:min-w-[13.5rem] ${
          open
            ? "border-accent2 ring-2 ring-accent2/15"
            : "border-line hover:border-accent2/45"
        } ${isPending ? "opacity-75" : ""}`}
      >
        {isPending ? (
          <InlineSpinner size="xs" className="shrink-0 border-muted/40 border-t-accent2" />
        ) : (
          <span className="text-accent2">
            <CalendarIcon />
          </span>
        )}
        <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-foreground">
          {isPending ? "Updating…" : buttonLabel}
        </span>
        <svg
          viewBox="0 0 20 20"
          className={`h-4 w-4 shrink-0 text-muted transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M5 7.5 10 12.5 15 7.5" />
        </svg>
      </button>
      {appliedPreset !== "custom" && !isPending ? (
        <p className="m-0 mt-1 truncate text-center text-[11px] font-semibold text-muted sm:text-right">
          {exactLabel}
        </p>
      ) : null}
      {open && panelPos
        ? createPortal(
            <div
              ref={panelRef}
              className="fixed z-50"
              style={{ top: panelPos.top, right: panelPos.right, width: panelPos.width }}
            >
              <DateRangePanel
                preset={preset}
                from={from}
                to={to}
                today={todayYmd()}
                summary={rangeSummary(from, to)}
                cursor={cursor}
                awaitingEnd={awaitingEnd}
                onPreset={choosePreset}
                onShowCustom={() => {
                  setPreset("custom");
                  setAwaitingEnd(false);
                }}
                onPickDay={pickDay}
                onCommitFrom={(ymd) => {
                  const end = ymd > to ? ymd : to;
                  setPreset("custom");
                  setFrom(ymd);
                  setTo(end);
                  setCursor(initialCalendarCursor(ymd, end));
                  setAwaitingEnd(false);
                }}
                onCommitTo={(ymd) => {
                  const start = ymd < from ? ymd : from;
                  setPreset("custom");
                  setFrom(start);
                  setTo(ymd);
                  setCursor(initialCalendarCursor(start, ymd));
                  setAwaitingEnd(false);
                }}
                onCursor={setCursor}
                onReset={() => loadDraft(applied.start, applied.end)}
                onDone={done}
              />
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

export function PeriodFilterFallback() {
  return (
    <div className="w-full min-w-0 sm:w-auto" role="status" aria-live="polite" aria-busy="true">
      <div className="flex min-h-11 w-full items-center gap-2 rounded-lg border border-line bg-card px-3 sm:min-h-9 sm:w-auto sm:min-w-[13.5rem]">
        <InlineSpinner size="xs" className="shrink-0 border-muted/40 border-t-accent2" />
        <span className="text-[13px] font-semibold text-muted">Loading period…</span>
      </div>
    </div>
  );
}
