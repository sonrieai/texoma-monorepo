import {
  normalizeProcedureCode,
  type CdtCodeRow,
  type CatalogEntryOptions,
} from "@/lib/cdt/categories";
import type {
  NexAppointmentDescriptor,
  NexCharge,
  NexProcedure,
  NexTreatmentPlan,
} from "@/lib/nexhealth/client";

const PROCEDURE_DESCRIPTOR_TYPE = "Procedure Codes";
const INVALID_DESCRIPTOR_CODE = "~BAD~";

export const UNCATEGORIZED_PROCEDURE_CATEGORY = "Uncategorized";

import {
  inferCategoryFromDescription,
  inferIsConsultProcedure,
} from "@/lib/cdt/infer-procedure-category";

function addToCatalog(
  catalog: Map<string, string>,
  code: string | null | undefined,
  description: string | null | undefined,
): void {
  const normalized = normalizeProcedureCode(code ?? "");
  if (normalized === "UNKNOWN") return;

  const desc = description?.trim() || "";
  const existing = catalog.get(normalized);
  if (desc && (!existing || desc.length > existing.length)) {
    catalog.set(normalized, desc);
    return;
  }
  if (!catalog.has(normalized)) {
    catalog.set(normalized, desc || normalized);
  }
}

/** Full Open Dental procedure master list from NexHealth appointment_descriptors. */
export function extractProcedureCodeCatalogFromDescriptors(
  descriptors: NexAppointmentDescriptor[],
): Map<string, string> {
  const catalog = new Map<string, string>();
  for (const row of descriptors) {
    if (row.descriptor_type !== PROCEDURE_DESCRIPTOR_TYPE) continue;
    if (row.active === false) continue;
    const code = row.code?.trim();
    if (!code || code === INVALID_DESCRIPTOR_CODE) continue;
    addToCatalog(catalog, code, row.name?.trim() || null);
  }
  return catalog;
}

export function mergeProcedureCodeCatalogs(
  ...catalogs: Map<string, string>[]
): Map<string, string> {
  const merged = new Map<string, string>();
  for (const catalog of catalogs) {
    for (const [code, description] of catalog) {
      addToCatalog(merged, code, description);
    }
  }
  return merged;
}

/** Unique OD/NexHealth procedure codes seen on synced ledger rows. */
export function extractProcedureCodeCatalog(
  procedures: NexProcedure[],
  charges: NexCharge[],
  treatmentPlans: NexTreatmentPlan[] = [],
): Map<string, string> {
  const catalog = new Map<string, string>();

  for (const row of procedures) {
    addToCatalog(catalog, row.code, readProcedureDescription(row));
  }
  for (const row of charges) {
    addToCatalog(catalog, row.procedure_code, null);
  }
  for (const plan of treatmentPlans) {
    for (const row of plan.procedures ?? []) {
      addToCatalog(catalog, row.code, readProcedureDescription(row));
    }
  }

  return catalog;
}

function readProcedureDescription(row: NexProcedure): string | null {
  if (typeof row.name === "string" && row.name.trim()) return row.name.trim();
  const raw = row as Record<string, unknown>;
  for (const key of ["description", "proc_description", "procedure_name"]) {
    const value = raw[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

export function catalogEntryToRow(
  code: string,
  description: string,
  existing?: CdtCodeRow | null,
  options?: CatalogEntryOptions,
): CdtCodeRow {
  const procCatId = options?.procCatId ?? existing?.procCatId ?? null;
  const fromProcCat = options?.categoryFromProcCat?.trim();
  const category =
    fromProcCat ||
    (existing?.category &&
    existing.category !== UNCATEGORIZED_PROCEDURE_CATEGORY
      ? existing.category
      : inferCategoryFromDescription(description || existing?.description || "")
          ?.category ?? UNCATEGORIZED_PROCEDURE_CATEGORY);

  const inferred = inferCategoryFromDescription(
    description || existing?.description || "",
  );

  return {
    code,
    category,
    description: description || existing?.description || code,
    procCatId,
    volumeBucket:
      existing?.volumeBucket ?? inferred?.volumeBucket ?? null,
    warrantyBucket: existing?.warrantyBucket ?? null,
    isAox: existing?.isAox ?? category === "Fixed (All-on-4)",
    isSoldCase: existing?.isSoldCase,
    isConsult:
      existing?.isConsult ??
      inferIsConsultProcedure(description || existing?.description || ""),
  };
}
