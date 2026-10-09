"use client";

import { useEffect, useState } from "react";
import {
  RANGE_PRESETS,
  isValidYmd,
  type RangePresetId,
} from "@/lib/ui/period";

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"] as const;

export function shiftCalendarMonth(yyyyMm: string, delta: number): string {
  const [y, m] = yyyyMm.split("-").map(Number);
  const date = new Date(y, m - 1 + delta, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

/** Left month of the pair. Keeps the end date on screen when the range is long. */
export function initialCalendarCursor(from: string, to: string): string {
  const startMonth = from.slice(0, 7);
  const endMonth = to.slice(0, 7);
  const previous = shiftCalendarMonth(endMonth, -1);
  if (startMonth === endMonth || startMonth === previous) return startMonth;
  return previous;
}

function ymdFromDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function monthCells(yyyyMm: string): { ymd: string; day: number; inMonth: boolean }[] {
  const [y, m] = yyyyMm.split("-").map(Number);
  const startDow = new Date(y, m - 1, 1).getDay();
  const days = new Date(y, m, 0).getDate();
  const cells: { ymd: string; day: number; inMonth: boolean }[] = [];

  for (let i = startDow; i > 0; i -= 1) {
    const date = new Date(y, m - 1, 1 - i);
    cells.push({ ymd: ymdFromDate(date), day: date.getDate(), inMonth: false });
  }
  for (let day = 1; day <= days; day += 1) {
    cells.push({
      ymd: `${yyyyMm}-${String(day).padStart(2, "0")}`,
      day,
      inMonth: true,
    });
  }
  let trailing = 1;
  while (cells.length % 7 !== 0) {
    const date = new Date(y, m - 1, days + trailing);
    cells.push({ ymd: ymdFromDate(date), day: date.getDate(), inMonth: false });
    trailing += 1;
  }
  return cells;
}

function Chevron({ dir }: { dir: "left" | "right" }) {
  return (
    <svg
      viewBox="0 0 20 20"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {dir === "left" ? (
        <path d="M12.5 4.5 7 10l5.5 5.5" />
      ) : (
        <path d="M7.5 4.5 13 10l-5.5 5.5" />
      )}
    </svg>
  );
}

function MonthColumn({
  cursor,
  from,
  to,
  today,
  onPrev,
  onNext,
  prevOnNarrowOnly,
  nextOnNarrowOnly,
  onPickDay,
}: {
  cursor: string;
  from: string;
  to: string;
  today: string;
  onPrev?: () => void;
  onNext?: () => void;
  prevOnNarrowOnly?: boolean;
  nextOnNarrowOnly?: boolean;
  onPickDay: (ymd: string) => void;
}) {
  const [y, m] = cursor.split("-").map(Number);
  const cells = monthCells(cursor);

  return (
    <div className="mx-auto w-full min-w-0 max-w-[19rem] select-none min-[720px]:max-w-none">
      <div className="relative mb-1.5 flex h-8 items-center justify-center">
        {onPrev ? (
          <button
            type="button"
            className={`absolute left-0 inline-flex h-8 w-8 items-center justify-center rounded-md text-muted hover:bg-background hover:text-foreground ${
              prevOnNarrowOnly ? "min-[720px]:hidden" : ""
            }`}
            onClick={onPrev}
            aria-label="Previous month"
          >
            <Chevron dir="left" />
          </button>
        ) : null}
        <span className="text-[13px] font-semibold text-foreground">
          {MONTH_NAMES[m - 1]} {y}
        </span>
        {onNext ? (
          <button
            type="button"
            className={`absolute right-0 inline-flex h-8 w-8 items-center justify-center rounded-md text-muted hover:bg-background hover:text-foreground ${
              nextOnNarrowOnly ? "min-[720px]:hidden" : ""
            }`}
            onClick={onNext}
            aria-label="Next month"
          >
            <Chevron dir="right" />
          </button>
        ) : null}
      </div>
      <div className="mb-0.5 grid grid-cols-7">
        {WEEKDAYS.map((day) => (
          <span
            key={`${cursor}-${day}`}
            className="py-1 text-center text-[10px] font-semibold tracking-wide text-muted"
          >
            {day}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((cell, index) => {
          const selected = cell.ymd === from || cell.ymd === to;
          const inSpan = from !== to && cell.ymd >= from && cell.ymd <= to;
          const column = index % 7;
          const roundLeft = inSpan && (cell.ymd === from || column === 0);
          const roundRight = inSpan && (cell.ymd === to || column === 6);
          const isToday = cell.ymd === today;
          return (
            <div
              key={cell.ymd}
              className={`p-px ${inSpan ? "bg-accent2/12" : ""} ${
                roundLeft ? "rounded-l-md" : ""
              } ${roundRight ? "rounded-r-md" : ""}`}
            >
              <button
                type="button"
                onClick={() => onPickDay(cell.ymd)}
                aria-pressed={selected}
                aria-label={cell.ymd}
                className={`flex aspect-square w-full items-center justify-center rounded-[5px] text-[12px] ${
                  selected
                    ? "bg-accent2 font-semibold text-white"
                    : cell.inMonth
                      ? isToday
                        ? "font-semibold text-accent2 hover:bg-background"
                        : "text-foreground hover:bg-background"
                      : "text-muted/40 hover:bg-background"
                }`}
              >
                {cell.day}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DateField({
  label,
  value,
  onCommit,
}: {
  label: string;
  value: string;
  onCommit: (ymd: string) => void;
}) {
  const [text, setText] = useState(value);

  useEffect(() => {
    setText(value);
  }, [value]);

  return (
    <label className="flex min-w-0 flex-col gap-1">
      <span className="text-[11px] font-semibold text-muted">{label}</span>
      <input
        type="text"
        inputMode="numeric"
        autoComplete="off"
        spellCheck={false}
        maxLength={10}
        placeholder="YYYY-MM-DD"
        aria-label={label}
        value={text}
        onChange={(event) => {
          const next = event.target.value;
          setText(next);
          if (isValidYmd(next)) onCommit(next);
        }}
        onBlur={() => {
          if (!isValidYmd(text)) setText(value);
        }}
        className="h-9 w-full rounded-md border border-line bg-card px-2.5 text-[13px] text-foreground outline-none transition-colors placeholder:text-muted/45 focus:border-accent2 focus:ring-2 focus:ring-accent2/20"
      />
    </label>
  );
}

export function DateRangePanel({
  preset,
  from,
  to,
  today,
  summary,
  cursor,
  awaitingEnd,
  onPreset,
  onShowCustom,
  onPickDay,
  onCommitFrom,
  onCommitTo,
  onCursor,
  onReset,
  onDone,
}: {
  preset: RangePresetId | "custom";
  from: string;
  to: string;
  today: string;
  summary: string;
  cursor: string;
  awaitingEnd: boolean;
  onPreset: (id: RangePresetId) => void;
  onShowCustom: () => void;
  onPickDay: (ymd: string) => void;
  onCommitFrom: (ymd: string) => void;
  onCommitTo: (ymd: string) => void;
  onCursor: (yyyyMm: string) => void;
  onReset: () => void;
  onDone: () => void;
}) {
  const custom = preset === "custom";
  const rightMonth = shiftCalendarMonth(cursor, 1);

  return (
    <div
      role="dialog"
      aria-label="Date range"
      className="flex max-h-[min(36rem,calc(100dvh-5.5rem))] w-full flex-col overflow-hidden rounded-xl border border-line bg-card shadow-[0_18px_48px_rgba(15,49,64,0.16)]"
    >
      <div
        className={`min-h-0 overflow-y-auto ${
          custom ? "sm:grid sm:grid-cols-[11.5rem_minmax(0,1fr)]" : ""
        }`}
      >
        <div
          role="radiogroup"
          aria-label="Range presets"
          className={`py-1.5 ${custom ? "border-b border-line sm:border-r sm:border-b-0" : ""}`}
        >
          {RANGE_PRESETS.map((item) => {
            const selected = preset === item.id;
            return (
              <label
                key={item.id}
                className={`mx-1.5 flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-[7px] text-[13.5px] ${
                  selected
                    ? "bg-accent2/10 font-semibold text-foreground"
                    : "text-foreground hover:bg-background"
                }`}
              >
                <input
                  type="radio"
                  name="period-range-preset"
                  value={item.id}
                  checked={selected}
                  onChange={() => onPreset(item.id)}
                  className="h-4 w-4 shrink-0 accent-accent2"
                />
                {item.label}
              </label>
            );
          })}
          <label
            className={`mx-1.5 flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-[7px] text-[13.5px] ${
              custom
                ? "bg-accent2/10 font-semibold text-foreground"
                : "text-foreground hover:bg-background"
            }`}
          >
            <input
              type="radio"
              name="period-range-preset"
              value="custom"
              checked={custom}
              onChange={onShowCustom}
              className="h-4 w-4 shrink-0 accent-accent2"
            />
            Custom
          </label>
          {custom ? null : (
            <p className="mx-1.5 mt-1 px-2 pb-1.5 text-[12px] font-medium leading-snug text-muted">
              {summary}
            </p>
          )}
        </div>

        {custom ? (
          <div className="min-w-0 px-3 py-3">
            <div className="mb-3 grid grid-cols-2 gap-3">
              <DateField label="Starting" value={from} onCommit={onCommitFrom} />
              <DateField label="Ending" value={to} onCommit={onCommitTo} />
            </div>
            <div className="grid grid-cols-1 gap-4 min-[720px]:grid-cols-2 min-[720px]:gap-3">
              <MonthColumn
                cursor={cursor}
                from={from}
                to={to}
                today={today}
                onPrev={() => onCursor(shiftCalendarMonth(cursor, -1))}
                onNext={() => onCursor(shiftCalendarMonth(cursor, 1))}
                nextOnNarrowOnly
                onPickDay={onPickDay}
              />
              <MonthColumn
                cursor={rightMonth}
                from={from}
                to={to}
                today={today}
                onPrev={() => onCursor(shiftCalendarMonth(cursor, -1))}
                onNext={() => onCursor(shiftCalendarMonth(cursor, 1))}
                prevOnNarrowOnly
                onPickDay={onPickDay}
              />
            </div>
            {awaitingEnd ? (
              <p className="m-0 mt-2 text-[11px] font-medium text-muted">Select an ending date</p>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="flex shrink-0 items-center justify-between border-t border-line px-1.5 py-1">
        <button
          type="button"
          onClick={onReset}
          className="rounded-md px-2.5 py-2 text-[13px] font-medium text-muted hover:bg-background hover:text-foreground"
        >
          Reset
        </button>
        <button
          type="button"
          onClick={onDone}
          className="rounded-md px-2.5 py-2 text-[13px] font-semibold text-accent2 hover:bg-accent2/10"
        >
          Done
        </button>
      </div>
    </div>
  );
}
