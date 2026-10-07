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

const WARRANTY_PATTERNS: { pattern: RegExp; bucket: DentureWarrantyBucket }[] = [
  { pattern: /\b(6[\s-]?mo|six[\s-]?month|\bm6\b|\.m6\b|6mo)\b/i, bucket: "m6" },
  { pattern: /\b(1[\s-]?yr|one[\s-]?year|\by1\b|\.y1\b|1yr)\b/i, bucket: "y1" },
  { pattern: /\b(3[\s-]?yr|three[\s-]?year|\by3\b|\.y3\b|3yr)\b/i, bucket: "y3" },
  { pattern: /\b(5[\s-]?yr|five[\s-]?year|\by5\b|\.y5\b|5yr)\b/i, bucket: "y5" },
];

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

/** Warranty bucket from OD ProcCode / Descript (denture & partial SKUs). */
export function inferWarrantyBucket(
  code: string | null | undefined,
  description: string | null | undefined,
): DentureWarrantyBucket | null {
  const hay = `${code ?? ""} ${description ?? ""}`.trim();
  if (!hay) return null;
  for (const row of WARRANTY_PATTERNS) {
    if (row.pattern.test(hay)) return row.bucket;
  }
  return null;
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
