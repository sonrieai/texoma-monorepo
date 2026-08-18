import { inferCategoryFromDescription } from "@/lib/cdt/infer-procedure-category";
import type { NexAppointmentDescriptor } from "@/lib/nexhealth/client";
import {
  buildProcCatByCode,
  extractOpenDentalProcCatId,
} from "@/lib/nexhealth/open-dental-proc-cat";
import { COLLECTIONS, getCollection } from "@/lib/mongo/client";
import type { ProcedureCategoryDoc } from "@/lib/mongo/types";

export type ProcedureCategorySyncResult = {
  upserted: number;
  categories: ProcedureCategoryDoc[];
};

function inferCategoryNameFromDescriptions(
  descriptions: string[],
): string | null {
  const counts = new Map<string, number>();
  for (const description of descriptions) {
    const inferred = inferCategoryFromDescription(description)?.category;
    if (!inferred) continue;
    counts.set(inferred, (counts.get(inferred) ?? 0) + 1);
  }
  let best: string | null = null;
  let bestCount = 0;
  for (const [name, count] of counts) {
    if (count > bestCount) {
      best = name;
      bestCount = count;
    }
  }
  return best;
}

/** Build / refresh Open Dental proc-code categories from NexHealth descriptors. */
export function buildProcedureCategoriesFromDescriptors(
  descriptors: NexAppointmentDescriptor[],
  existing: ProcedureCategoryDoc[] = [],
): ProcedureCategoryDoc[] {
  const existingById = new Map(existing.map((row) => [row.procCatId, row]));
  const groups = new Map<
    number,
    { descriptions: string[]; codeCount: number }
  >();

  for (const descriptor of descriptors) {
    const procCatId = extractOpenDentalProcCatId(descriptor);
    if (procCatId == null) continue;
    let group = groups.get(procCatId);
    if (!group) {
      group = { descriptions: [], codeCount: 0 };
      groups.set(procCatId, group);
    }
    group.codeCount += 1;
    const description = descriptor.name?.trim();
    if (description) group.descriptions.push(description);
  }

  const syncedAt = new Date().toISOString();
  const categories: ProcedureCategoryDoc[] = [];

  for (const [procCatId, group] of groups) {
    const prior = existingById.get(procCatId);
    const inferred = inferCategoryNameFromDescriptions(group.descriptions);
    const name =
      prior?.name?.trim() ||
      inferred ||
      `Category ${procCatId}`;

    categories.push({
      procCatId,
      name,
      hidden: prior?.hidden ?? false,
      codeCount: group.codeCount,
      syncedAt,
    });
  }

  return categories.sort(
    (a, b) => a.name.localeCompare(b.name) || a.procCatId - b.procCatId,
  );
}

export async function syncProcedureCategoriesFromDescriptors(
  descriptors: NexAppointmentDescriptor[],
): Promise<ProcedureCategorySyncResult> {
  const col = await getCollection<ProcedureCategoryDoc>(
    COLLECTIONS.procedureCategories,
  );
  const existing = await col.find({}).toArray();
  const categories = buildProcedureCategoriesFromDescriptors(
    descriptors,
    existing,
  );

  if (categories.length === 0) {
    return { upserted: 0, categories: existing };
  }

  let upserted = 0;
  for (const row of categories) {
    await col.updateOne({ procCatId: row.procCatId }, { $set: row }, { upsert: true });
    upserted += 1;
  }

  const activeIds = categories.map((row) => row.procCatId);
  await col.deleteMany({ procCatId: { $nin: activeIds } });

  return { upserted, categories };
}

export function procedureCategoryMap(
  categories: ProcedureCategoryDoc[],
): Map<number, ProcedureCategoryDoc> {
  return new Map(categories.map((row) => [row.procCatId, row]));
}

export { buildProcCatByCode };
