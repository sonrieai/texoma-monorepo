import "server-only";
import type { CdtCodeRow } from "@/lib/cdt/categories";
import {
  COLLECTIONS,
  getCollection,
  isMongoConfigured,
  type WarehouseMetaDoc,
} from "@/lib/mongo/client";
import type { CdtCodeDoc, ProcedureCategoryDoc } from "@/lib/mongo/types";

const WAREHOUSE_NOT_CONFIGURED =
  "Practice data warehouse is not configured. Set MONGODB_URI in .env.local.";

export type ProcedureCodeListResult = {
  codes: CdtCodeRow[];
  categories: readonly string[];
  feeScheduleNames: [string | null, string | null, string | null];
};

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

function assertMongoConfigured(): void {
  if (!isMongoConfigured()) {
    throw new Error(WAREHOUSE_NOT_CONFIGURED);
  }
}

export async function listProcedureCodes(): Promise<ProcedureCodeListResult> {
  assertMongoConfigured();
  const col = await getCollection<CdtCodeDoc>(COLLECTIONS.cdtCodes);
  const categoryCol = await getCollection<ProcedureCategoryDoc>(
    COLLECTIONS.procedureCategories,
  );
  const metaCol = await getCollection<WarehouseMetaDoc>(COLLECTIONS.meta);
  const [docs, categoryDocs, meta] = await Promise.all([
    col.find({}).sort({ code: 1 }).toArray(),
    categoryCol.find({ hidden: { $ne: true } }).sort({ name: 1 }).toArray(),
    metaCol.findOne({ _id: "overview" }),
  ]);
  const categories =
    categoryDocs.length > 0
      ? categoryDocs.map((row) => row.name)
      : [...new Set(docs.map((doc) => doc.category).filter(Boolean))].sort(
          (a, b) => a.localeCompare(b),
        );
  return {
    codes: docs.map(docToRow),
    categories,
    feeScheduleNames: meta?.feeScheduleNames ?? [null, null, null],
  };
}
