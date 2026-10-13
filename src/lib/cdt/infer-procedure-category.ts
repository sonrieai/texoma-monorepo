import type {
  DentureWarrantyBucket,
  ProcedureVolumeBucket,
} from "@/lib/cdt/categories";
import { normalizeProcedureCode } from "@/lib/cdt/categories";

const CONSULT_DESCRIPTION_PATTERN =
  /\b(new patient consult|np consult|new pt consult|initial consult|consultation exam|consult exam|consultation|consult)\b/i;

const CONSULT_CODE_PREFIXES = ["N9310", "D9310"] as const;
const CONSULT_EXACT_CODES = new Set(["D0150", "D0140", "D9310"]);

const CATEGORY_FROM_DESCRIPTION: {
  pattern: RegExp;
  category: string;
  volumeBucket?: ProcedureVolumeBucket;
}[] = [
  { pattern: /\bextraction\b/i, category: "Extractions", volumeBucket: "extractions" },
  { pattern: /\bimplant\b/i, category: "Implants", volumeBucket: "implants" },
  {
    pattern: /\ball[\s-]?on|\baox\b/i,
    category: "Fixed (All-on-4)",
    volumeBucket: "aox",
  },
  {
    pattern: /\bpartial denture\b/i,
    category: "Partial Dentures",
    volumeBucket: "partials",
  },
  { pattern: /\bdenture\b/i, category: "Dentures", volumeBucket: "dentures" },
  {
    pattern: /\bprophy|fluoride|perio maint|cleaning|hygiene\b/i,
    category: "Hygiene",
  },
  {
    pattern: /\bcrown|filling|restor|composite|amalgam\b/i,
    category: "Restorative Dentistry",
  },
  { pattern: /\bsurgery|surgical\b/i, category: "Other Surgery" },
  { pattern: /\bexam\b/i, category: "Hygiene" },
  { pattern: /\bx-ray|radiograph|bitewing|periapical|panoramic\b/i, category: "Hygiene" },
];

/** Spelled durations. `month` / `year` come before the short forms so "6-Month" is not cut at "Mo". */
const WARRANTY_TEXT_PATTERNS: { pattern: RegExp; bucket: DentureWarrantyBucket }[] = [
  {
    pattern:
      /(?:^|[^a-z0-9])(?:6[\s-]*months?|six[\s-]*months?|6[\s-]*mo|m6)(?![a-z0-9])/i,
    bucket: "m6",
  },
  {
    pattern:
      /(?:^|[^a-z0-9])(?:1[\s-]*years?|one[\s-]*years?|1[\s-]*yr|y1)(?![a-z0-9])/i,
    bucket: "y1",
  },
  {
    pattern:
      /(?:^|[^a-z0-9])(?:3[\s-]*years?|three[\s-]*years?|3[\s-]*yr|y3)(?![a-z0-9])/i,
    bucket: "y3",
  },
  {
    pattern:
      /(?:^|[^a-z0-9])(?:5[\s-]*years?|five[\s-]*years?|5[\s-]*yr|y5)(?![a-z0-9])/i,
    bucket: "y5",
  },
];

/** Chart suffixes on complete / immediate dentures. `.5` is SoonerCare, not a warranty. N8888 is not in this set. */
const DENTURE_WARRANTY_SUFFIX =
  /^(?:D)?(?:5110|5120|5130|5140)\.(11|44|22|33|1|4|2|3)$/i;

const WARRANTY_SUFFIX_BUCKET: Record<string, DentureWarrantyBucket> = {
  "1": "m6",
  "11": "m6",
  "4": "y1",
  "44": "y1",
  "2": "y3",
  "22": "y3",
  "3": "y5",
  "33": "y5",
};

function warrantyFromText(text: string): DentureWarrantyBucket | null {
  const hay = text.trim();
  if (!hay) return null;
  for (const row of WARRANTY_TEXT_PATTERNS) {
    if (row.pattern.test(hay)) return row.bucket;
  }
  return null;
}

function warrantyFromDeliverySuffix(
  code: string | null | undefined,
): DentureWarrantyBucket | null {
  const normalized = normalizedUpperCode(code);
  if (normalized === "UNKNOWN") return null;
  const match = DENTURE_WARRANTY_SUFFIX.exec(normalized);
  if (!match?.[1]) return null;
  return WARRANTY_SUFFIX_BUCKET[match[1]] ?? null;
}

function normalizedUpperCode(code: string | null | undefined): string {
  return normalizeProcedureCode(code ?? "").toUpperCase();
}

/** NP consult from Open Dental procedure code (Texoma N9310*, D9310, D0150/D0140). */
export function inferIsConsultCode(code: string | null | undefined): boolean {
  const normalized = normalizedUpperCode(code);
  if (normalized === "UNKNOWN") return false;
  if (CONSULT_EXACT_CODES.has(normalized)) return true;
  for (const prefix of CONSULT_CODE_PREFIXES) {
    if (normalized.startsWith(prefix)) return true;
  }
  return false;
}

/** Infer NP consult procedure from Open Dental description (sync-time + runtime fallback). */
export function inferIsConsultProcedure(description: string): boolean {
  return CONSULT_DESCRIPTION_PATTERN.test(description.trim());
}

export function inferIsConsultFromCodeAndDescription(
  code: string | null | undefined,
  description: string | null | undefined,
): boolean {
  if (inferIsConsultCode(code)) return true;
  return inferIsConsultProcedure(description?.trim() || "");
}

/**
 * Warranty bucket from OD ProcCode / Descript.
 * Description text wins, then the same wording on the code, then the
 * D5110–D5140 chart suffix. `.5` and unsuffixed N8888 stay unset.
 */
export function inferWarrantyBucket(
  code: string | null | undefined,
  description: string | null | undefined,
): DentureWarrantyBucket | null {
  return (
    warrantyFromText(description ?? "") ??
    warrantyFromText(code ?? "") ??
    warrantyFromDeliverySuffix(code)
  );
}

/** Map trial T-codes / uncategorized OD rows from description text. */
export function inferCategoryFromDescription(description: string): {
  category: string;
  volumeBucket?: ProcedureVolumeBucket;
} | null {
  const text = description.trim();
  if (!text) return null;
  for (const row of CATEGORY_FROM_DESCRIPTION) {
    if (row.pattern.test(text)) {
      return { category: row.category, volumeBucket: row.volumeBucket };
    }
  }
  return null;
}
