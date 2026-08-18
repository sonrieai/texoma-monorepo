import type { ProcedureVolumeBucket } from "@/lib/cdt/categories";

const CONSULT_DESCRIPTION_PATTERN =
  /\b(new patient consult|np consult|new pt consult|initial consult|consultation exam|consult exam|consultation)\b/i;

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

/** Infer NP consult procedure from Open Dental description (sync-time + runtime fallback). */
export function inferIsConsultProcedure(description: string): boolean {
  return CONSULT_DESCRIPTION_PATTERN.test(description.trim());
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
