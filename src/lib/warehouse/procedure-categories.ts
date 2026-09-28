import { inferCategoryFromDescription } from "@/lib/cdt/infer-procedure-category";
import type { ProcedureDescriptor } from "@/lib/warehouse/types";

type OpenDentalDescriptorData = {
  ProcCat?: number;
  IsHygiene?: number | boolean;
  IsHidden?: number | boolean;
};

/** Open Dental procedure-code category identifier from descriptor metadata. */
export function extractOpenDentalProcCatId(
  descriptor: ProcedureDescriptor,
): number | null {
  const data = descriptor.data as OpenDentalDescriptorData | undefined;
  const procCat = data?.ProcCat;
  return typeof procCat === "number" && Number.isFinite(procCat) ? procCat : null;
}

export function buildProcCatByCode(
  descriptors: ProcedureDescriptor[],
): Map<string, number> {
  const map = new Map<string, number>();
  for (const row of descriptors) {
    const code = row.code?.trim();
    if (!code || code === "~BAD~") continue;
    const procCatId = extractOpenDentalProcCatId(row);
    if (procCatId == null) continue;
    map.set(code.toUpperCase(), procCatId);
  }
  return map;
}

export function isOpenDentalHygieneDescriptor(
  descriptor: ProcedureDescriptor,
): boolean {
  const data = descriptor.data as OpenDentalDescriptorData | undefined;
  const flag = data?.IsHygiene;
  return flag === 1 || flag === true;
}

export type ProcedureCategoryRow = {
  procCatId: number;
  name: string;
  hidden: boolean;
  codeCount: number;
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

/** Group Open Dental procedure codes by ProcCat for display. */
export function buildProcedureCategoriesFromDescriptors(
  descriptors: ProcedureDescriptor[],
  existing: ProcedureCategoryRow[] = [],
): ProcedureCategoryRow[] {
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

  const categories: ProcedureCategoryRow[] = [];
  for (const [procCatId, group] of groups) {
    const prior = existingById.get(procCatId);
    const inferred = inferCategoryNameFromDescriptions(group.descriptions);
    const name =
      prior?.name?.trim() || inferred || `Category ${procCatId}`;
    categories.push({
      procCatId,
      name,
      hidden: prior?.hidden ?? false,
      codeCount: group.codeCount,
    });
  }

  return categories.sort(
    (a, b) => a.name.localeCompare(b.name) || a.procCatId - b.procCatId,
  );
}
