"use client";

type Props = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  label?: string;
  resultCount?: number;
  totalCount?: number;
};

export function ListSearch({
  value,
  onChange,
  placeholder = "Search…",
  label = "Search",
  resultCount,
  totalCount,
}: Props) {
  return (
    <div className="mb-3 flex flex-col gap-1.5 sm:flex-row sm:items-end sm:justify-between">
      <label className="flex min-w-0 flex-1 flex-col gap-1 text-[11px] font-semibold uppercase tracking-wide text-muted">
        {label}
        <input
          type="search"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full max-w-md rounded-lg border border-line bg-background px-2.5 py-2 text-[13px] font-medium normal-case text-foreground"
          autoComplete="off"
        />
      </label>
      {typeof resultCount === "number" && typeof totalCount === "number" ? (
        <p className="m-0 shrink-0 text-[11.5px] text-muted">
          {value.trim()
            ? `${resultCount} of ${totalCount} match`
            : `${totalCount} total`}
        </p>
      ) : null}
    </div>
  );
}
