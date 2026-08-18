/** Cockpit chart category labels (mapping targets in Settings — not OD data). */
export const COCKPIT_CATEGORIES = [
  "Extractions",
  "Implants",
  "Dentures",
  "Partial Dentures",
  "Other Surgery",
  "Restorative Dentistry",
  "Fixed (All-on-4)",
  "Hygiene",
] as const;

export const PROCEDURE_VOLUME_BUCKETS = [
  "extractions",
  "implants",
  "aox",
  "dentures",
  "partials",
  "remakes",
] as const;

export const DENTURE_WARRANTY_BUCKETS = ["m6", "y1", "y3", "y5"] as const;

export type ProcedureVolumeBucket = (typeof PROCEDURE_VOLUME_BUCKETS)[number];
export type DentureWarrantyBucket = (typeof DENTURE_WARRANTY_BUCKETS)[number];

export type ProcedureCodeInput = {
  code: string;
  category: string;
  description: string;
  volumeBucket?: ProcedureVolumeBucket | null;
  warrantyBucket?: DentureWarrantyBucket | null;
  isSoldCase?: boolean;
  isConsult?: boolean;
};
