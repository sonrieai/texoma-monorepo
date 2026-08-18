import {
  catalogEntryToRow,
  extractProcedureCodeCatalog,
  extractProcedureCodeCatalogFromDescriptors,
  mergeProcedureCodeCatalogs,
} from "@/lib/nexhealth/procedure-code-catalog";
import { buildProcCatByCode } from "@/lib/nexhealth/open-dental-proc-cat";
import type { ProcedureCodeFees } from "@/lib/nexhealth/procedure-code-fees";
import type {
  NexAppointmentDescriptor,
  NexCharge,
  NexProcedure,
  NexTreatmentPlan,
} from "@/lib/nexhealth/client";
import { COLLECTIONS, getCollection } from "@/lib/mongo/client";
import type { CdtCodeDoc, ProcedureCategoryDoc } from "@/lib/mongo/types";
import type { CdtCodeRow } from "@/lib/cdt/categories";

function rowToDoc(row: CdtCodeRow): CdtCodeDoc {
  return {
    code: row.code,
    category: row.category,
    description: row.description,
    procCatId: row.procCatId ?? null,
    volumeBucket: row.volumeBucket ?? null,
    warrantyBucket: row.warrantyBucket ?? null,
    isAox: row.isAox ?? false,
    isSoldCase: row.isSoldCase,
    isConsult: row.isConsult,
    fee1: row.fee1 ?? null,
    fee2: row.fee2 ?? null,
    fee3: row.fee3 ?? null,
  };
}

function docToRow(doc: CdtCodeDoc): CdtCodeRow {
  return {
    code: doc.code,
    category: doc.category,
    description: doc.description,
    procCatId: doc.procCatId ?? null,
    volumeBucket: doc.volumeBucket,
    warrantyBucket: doc.warrantyBucket,
    isAox: doc.isAox,
    isSoldCase: doc.isSoldCase,
    isConsult: doc.isConsult,
    fee1: doc.fee1 ?? null,
    fee2: doc.fee2 ?? null,
    fee3: doc.fee3 ?? null,
  };
}

function applyFees(row: CdtCodeRow, fees?: ProcedureCodeFees): CdtCodeRow {
  const entry = fees?.byCode.get(row.code);
  if (!entry) return row;
  return {
    ...row,
    fee1: entry.fee1,
    fee2: entry.fee2,
    fee3: entry.fee3,
  };
}

export type ProcedureCodeSyncResult = {
  upserted: number;
  /** Stale rows removed (earlier seeds / codes no longer in OD or NexHealth). */
  removed: number;
};

/** Upsert procedure codes from NexHealth / Open Dental sync payloads. */
export async function syncProcedureCodesFromNexHealth(params: {
  procedures: NexProcedure[];
  charges: NexCharge[];
  treatmentPlans?: NexTreatmentPlan[];
  /** Full OD master list — GET /locations/{id}/appointment_descriptors */
  appointmentDescriptors?: NexAppointmentDescriptor[];
  /** Open Dental category names keyed by ProcCat id. */
  procedureCategories?: Map<number, ProcedureCategoryDoc>;
  /** Fee 1–3 from GET /fee_schedule_procedures */
  procedureCodeFees?: ProcedureCodeFees;
}): Promise<ProcedureCodeSyncResult> {
  const descriptors = params.appointmentDescriptors ?? [];
  const procCatByCode = buildProcCatByCode(descriptors);
  const fromDescriptors = descriptors.length
    ? extractProcedureCodeCatalogFromDescriptors(descriptors)
    : new Map<string, string>();
  const fromLedger = extractProcedureCodeCatalog(
    params.procedures,
    params.charges,
    params.treatmentPlans ?? [],
  );
  const catalog = mergeProcedureCodeCatalogs(fromDescriptors, fromLedger);
  if (catalog.size === 0) return { upserted: 0, removed: 0 };

  const col = await getCollection<CdtCodeDoc>(COLLECTIONS.cdtCodes);
  const codes = [...catalog.keys()];
  const existingDocs = await col.find({ code: { $in: codes } }).toArray();
  const existingByCode = new Map(existingDocs.map((d) => [d.code, docToRow(d)]));

  let upserted = 0;
  for (const [code, description] of catalog) {
    const procCatId = procCatByCode.get(code) ?? existingByCode.get(code)?.procCatId ?? null;
    const categoryFromProcCat =
      procCatId != null
        ? params.procedureCategories?.get(procCatId)?.name ?? null
        : null;

    const row = applyFees(
      catalogEntryToRow(code, description, existingByCode.get(code), {
        procCatId,
        categoryFromProcCat,
      }),
      params.procedureCodeFees,
    );
    await col.updateOne(
      { code },
      { $set: rowToDoc(row) },
      { upsert: true },
    );
    upserted += 1;
  }

  const prune = await col.deleteMany({ code: { $nin: codes } });

  return { upserted, removed: prune.deletedCount ?? 0 };
}

export type { ProcedureCodeFees };
