/**
 * Procedure code lookup for cockpit charts.
 * Mappings load from Mongo `cdt_codes` (synced from Open Dental via NexHealth).
 * No bundled code catalog at runtime.
 */

import { inferCategoryFromDescription } from "@/lib/cdt/infer-procedure-category";

export type CatalogEntryOptions = {
  procCatId?: number | null;
  /** Category name from Open Dental ProcCat (NexHealth sync). */
  categoryFromProcCat?: string | null;
};

type CodeEntry = {
  category: string;
  description: string;
  volumeBucket?: string;
  warrantyBucket?: string;
  isSoldCase?: boolean;
  isConsult?: boolean;
};

export type CdtCodeRow = {
  code: string;
  category: string;
  description: string;
  procCatId?: number | null;
  volumeBucket?: string | null;
  warrantyBucket?: string | null;
  isAox?: boolean;
  isSoldCase?: boolean;
  /** NP consult procedure marker (Settings / Mongo `cdt_codes`). */
  isConsult?: boolean;
  /** Office / insurance fee schedule amounts from NexHealth (matches OD Fee 1–3). */
  fee1?: string | null;
  fee2?: string | null;
  fee3?: string | null;
};

export type ProcedureVolumeBucket =
  | "extractions"
  | "implants"
  | "aox"
  | "dentures"
  | "partials"
  | "remakes";

export type DentureWarrantyBucket = "m6" | "y1" | "y3" | "y5";

export type CdtLookup = {
  lookupCategory(code: string | null | undefined): string | null;
  lookupDescription(code: string | null | undefined): string | null;
  lookupWarrantyBucket(
    code: string | null | undefined,
  ): DentureWarrantyBucket | null;
  volumeBucket(code: string | null | undefined): ProcedureVolumeBucket | null;
  isAoxSoldCode(code: string | null | undefined): boolean;
  isAoxCode(code: string | null | undefined): boolean;
  isConsultCode(code: string | null | undefined): boolean;
  isDentureRemakeCode(code: string | null | undefined): boolean;
};

/** @deprecated category order comes from Mongo procedure_categories at runtime */
export const CDT_CATEGORY_ORDER: readonly string[] = [];

type CatalogState = {
  byCode: Record<string, CodeEntry>;
  aoxSold: Set<string>;
  aoxAll: Set<string>;
  consult: Set<string>;
};

export function normalizeProcedureCode(raw: string | null | undefined): string {
  if (!raw?.trim()) return "UNKNOWN";
  return raw.trim().toUpperCase();
}

function entryFor(state: CatalogState, code: string): CodeEntry | null {
  const exact = state.byCode[code];
  if (exact) return exact;
  const base = code.split(".")[0];
  if (base !== code) return state.byCode[base] ?? null;
  return null;
}

function makeLookup(state: CatalogState): CdtLookup {
  const lookupCategory = (
    code: string | null | undefined,
  ): string | null => {
    const normalized = normalizeProcedureCode(code);
    if (normalized === "UNKNOWN") return null;
    const entry = entryFor(state, normalized);
    if (entry?.category && entry.category !== "Uncategorized") {
      return entry.category;
    }
    const fromDesc = inferCategoryFromDescription(entry?.description ?? "");
    return fromDesc?.category ?? null;
  };

  const lookupDescription = (
    code: string | null | undefined,
  ): string | null => {
    const normalized = normalizeProcedureCode(code);
    if (normalized === "UNKNOWN") return null;
    const desc = entryFor(state, normalized)?.description?.trim();
    return desc || null;
  };

  const lookupWarrantyBucket = (
    code: string | null | undefined,
  ): DentureWarrantyBucket | null => {
    const normalized = normalizeProcedureCode(code);
    if (normalized === "UNKNOWN") return null;
    const exact = entryFor(state, normalized)?.warrantyBucket;
    if (exact === "m6" || exact === "y1" || exact === "y3" || exact === "y5") {
      return exact;
    }
    return null;
  };

  const isAoxSoldCode = (code: string | null | undefined): boolean => {
    const normalized = normalizeProcedureCode(code);
    if (normalized === "UNKNOWN") return false;
    if (state.aoxSold.has(normalized)) return true;
    return entryFor(state, normalized)?.isSoldCase === true;
  };

  const isAoxCode = (code: string | null | undefined): boolean => {
    const normalized = normalizeProcedureCode(code);
    if (normalized === "UNKNOWN") return false;
    if (state.aoxAll.has(normalized) || state.aoxSold.has(normalized)) {
      return true;
    }
    return lookupCategory(normalized) === "Fixed (All-on-4)";
  };

  const isConsultCode = (code: string | null | undefined): boolean => {
    const normalized = normalizeProcedureCode(code);
    if (normalized === "UNKNOWN") return false;
    if (state.consult.has(normalized)) return true;
    return entryFor(state, normalized)?.isConsult === true;
  };

  const isDentureRemakeCode = (code: string | null | undefined): boolean => {
    const normalized = normalizeProcedureCode(code);
    if (normalized === "UNKNOWN") return false;
    const entry = entryFor(state, normalized);
    if (entry?.volumeBucket === "remakes") return true;
    const cat = entry?.category;
    const desc = entry?.description?.toLowerCase() ?? "";
    return (
      (cat === "Dentures" || cat === "Partial Dentures") &&
      /\b(repair|replace broken|remake)\b/i.test(desc)
    );
  };

  const volumeBucket = (
    code: string | null | undefined,
  ): ProcedureVolumeBucket | null => {
    const normalized = normalizeProcedureCode(code);
    if (normalized === "UNKNOWN") return null;

    if (isDentureRemakeCode(normalized)) return "remakes";
    if (isAoxCode(normalized)) return "aox";

    const fromEntry = entryFor(state, normalized)?.volumeBucket;
    if (
      fromEntry === "extractions" ||
      fromEntry === "implants" ||
      fromEntry === "aox" ||
      fromEntry === "dentures" ||
      fromEntry === "partials"
    ) {
      return fromEntry;
    }

    const entry = entryFor(state, normalized);
    const inferred = inferCategoryFromDescription(entry?.description ?? "");
    if (inferred?.volumeBucket) return inferred.volumeBucket;

    const cat = lookupCategory(normalized);
    if (cat === "Extractions") return "extractions";
    if (cat === "Partial Dentures") return "partials";
    if (cat === "Dentures") return "dentures";
    if (cat === "Implants") return "implants";
    return null;
  };

  return {
    lookupCategory,
    lookupDescription,
    lookupWarrantyBucket,
    volumeBucket,
    isAoxSoldCode,
    isAoxCode,
    isConsultCode,
    isDentureRemakeCode,
  };
}

/** Use when warehouse has no mapped codes yet (no bundled fallback). */
export const emptyCdtLookup = makeLookup({
  byCode: {},
  aoxSold: new Set<string>(),
  aoxAll: new Set<string>(),
  consult: new Set<string>(),
});

/** Build lookup from warehouse `cdt_codes` (Open Dental via NexHealth sync). */
export function createCdtLookupFromDocs(docs: CdtCodeRow[]): CdtLookup {
  const byCode: Record<string, CodeEntry> = {};
  const aoxSold = new Set<string>();
  const aoxAll = new Set<string>();
  const consult = new Set<string>();
  for (const doc of docs) {
    const code = normalizeProcedureCode(doc.code);
    if (code === "UNKNOWN") continue;
    byCode[code] = {
      category: doc.category,
      description: doc.description,
      volumeBucket: doc.volumeBucket ?? undefined,
      warrantyBucket: doc.warrantyBucket ?? undefined,
      isSoldCase: doc.isSoldCase,
      isConsult: doc.isConsult,
    };
    if (doc.isSoldCase) aoxSold.add(code);
    if (doc.isConsult) consult.add(code);
    if (doc.isAox || doc.category === "Fixed (All-on-4)") aoxAll.add(code);
  }
  return makeLookup({ byCode, aoxSold, aoxAll, consult });
}

export function sortCategoryRows<T extends { category: string }>(
  rows: T[],
  order?: readonly string[],
): T[] {
  if (!order?.length) {
    return [...rows].sort((a, b) => a.category.localeCompare(b.category));
  }
  const rank = new Map<string, number>(order.map((c, i) => [c, i]));
  return [...rows].sort(
    (a, b) =>
      (rank.get(a.category) ?? 999) - (rank.get(b.category) ?? 999) ||
      a.category.localeCompare(b.category),
  );
}
