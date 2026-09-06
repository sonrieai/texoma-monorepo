"use client";

import { useEffect, useState } from "react";
import { MONTH_LABELS, rangePreset } from "@/lib/ui/period";

function shiftMonth(yyyyMm: string, delta: number): string {
  const [y, m] = yyyyMm.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function DayCalendar({
  cursor,
  selected,
  onCursor,
  onSelect,
}: {
  cursor: string;
  selected: string;
  onCursor: (yyyyMm: string) => void;
  onSelect: (ymd: string) => void;
}) {
  const [y, m] = cursor.split("-").map(Number);
  const startDow = new Date(y, m - 1, 1).getDay();
  const days = new Date(y, m, 0).getDate();
  const cells: (number | null)[] = [
    ...Array.from({ length: startDow }, () => null),
    ...Array.from({ length: days }, (_, i) => i + 1),
  ];

  return (
    <div className="w-[212px] select-none">
      <div className="mb-1.5 flex items-center justify-between">
        <button
          type="button"
          className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-background text-[15px] hover:bg-line"
          onClick={() => onCursor(shiftMonth(cursor, -1))}
          aria-label="Previous month"
        >
          ‹
        </button>
        <span className="text-[12.5px] font-bold">
          {MONTH_LABELS[m - 1]} {y}
        </span>
        <button
          type="button"
          className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-background text-[15px] hover:bg-line"
          onClick={() => onCursor(shiftMonth(cursor, 1))}
          aria-label="Next month"
        >
          ›
        </button>
      </div>
      <div className="mb-0.5 grid grid-cols-7 gap-0.5">
        {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
          <span key={`${d}-${i}`} className="text-center text-[10px] font-bold text-muted">
            {d}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {cells.map((day, i) => {
          if (day == null) return <span key={`e-${i}`} className="h-8" />;
          const ymd = `${cursor}-${String(day).padStart(2, "0")}`;
          const sel = ymd === selected;
          return (
            <button
              key={ymd}
              type="button"
              onClick={() => onSelect(ymd)}
              className={`inline-flex h-8 items-center justify-center rounded-md text-[11.5px] ${
                sel
                  ? "bg-accent2 font-bold text-white"
                  : "text-foreground hover:bg-background"
              }`}
            >
              {day}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function MonthCalendar({
  year,
  selected,
  onYear,
  onSelect,
}: {
  year: number;
  selected: string;
  onYear: (year: number) => void;
  onSelect: (yyyyMm: string) => void;
}) {
  const [selY, selM] = selected.split("-").map(Number);
  return (
    <div className="w-[212px] select-none">
      <div className="mb-1.5 flex items-center justify-between">
        <button
          type="button"
          className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-background text-[15px] hover:bg-line"
          onClick={() => onYear(year - 1)}
          aria-label="Previous year"
        >
          ‹
        </button>
        <span className="text-[12.5px] font-bold">{year}</span>
        <button
          type="button"
          className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-background text-[15px] hover:bg-line"
          onClick={() => onYear(year + 1)}
          aria-label="Next year"
        >
          ›
        </button>
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        {MONTH_LABELS.map((label, i) => {
          const key = `${year}-${String(i + 1).padStart(2, "0")}`;
          const sel = year === selY && i + 1 === selM;
          return (
            <button
              key={key}
              type="button"
              onClick={() => onSelect(key)}
              className={`inline-flex min-h-11 items-center justify-center rounded-md text-[12px] ${
                sel
                  ? "bg-accent2 font-bold text-white"
                  : "bg-background text-foreground hover:bg-line"
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function RangePicker({
  from,
  to,
  onApply,
}: {
  from: string;
  to: string;
  onApply: (from: string, to: string) => void;
}) {
  const presets = [
    ["thisYear", "This Year"],
    ["past3", "Past 3 Months"],
    ["past6", "Past 6 Months"],
    ["lastYear", "Last Year"],
  ] as const;
  const [draftFrom, setDraftFrom] = useState(from);
  const [draftTo, setDraftTo] = useState(to);

  useEffect(() => {
    setDraftFrom(from);
    setDraftTo(to);
  }, [from, to]);

  const setDraftRange = (nextFrom: string, nextTo: string) => {
    setDraftFrom(nextFrom);
    setDraftTo(nextFrom > nextTo ? nextFrom : nextTo);
  };

  return (
    <div className="w-[210px]">
      <div className="grid grid-cols-2 gap-1.5">
        {presets.map(([key, label]) => {
          const preset = rangePreset(key);
          const selected = preset.from === draftFrom && preset.to === draftTo;
          return (
            <button
              key={key}
              type="button"
              aria-pressed={selected}
              className={`min-h-10 rounded-md border px-1.5 text-[11px] font-semibold ${
                selected
                  ? "border-accent2 bg-accent2 text-white"
                  : "border-line bg-background hover:border-accent2 hover:bg-accent2 hover:text-white"
              }`}
              onClick={() => {
                setDraftFrom(preset.from);
                setDraftTo(preset.to);
              }}
            >
              {label}
            </button>
          );
        })}
      </div>
      <div className="my-2.5 h-px bg-line" />
      <label className="flex flex-col gap-1 text-[11px] font-semibold text-muted">
        From
        <input
          type="date"
          value={draftFrom}
          onChange={(e) => {
            const next = e.target.value;
            if (!next) return;
            setDraftRange(next, draftTo);
          }}
          className="min-h-11 rounded-md border border-line bg-background px-2 text-[16px] text-foreground sm:min-h-9 sm:text-[12.5px]"
        />
      </label>
      <label className="mt-2 flex flex-col gap-1 text-[11px] font-semibold text-muted">
        To
        <input
          type="date"
          value={draftTo}
          onChange={(e) => {
            const next = e.target.value;
            if (!next) return;
            setDraftRange(next < draftFrom ? next : draftFrom, next);
          }}
          className="min-h-11 rounded-md border border-line bg-background px-2 text-[16px] text-foreground sm:min-h-9 sm:text-[12.5px]"
        />
      </label>
      <button
        type="button"
        className="mt-2.5 min-h-11 w-full rounded-md bg-accent2 text-[12px] font-semibold text-white hover:opacity-90 sm:min-h-9"
        onClick={() => onApply(draftFrom, draftTo)}
      >
        Apply
      </button>
    </div>
  );
}
