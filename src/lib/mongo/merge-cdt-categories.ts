import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { CdtCodeRow } from "@/lib/cdt/categories";
import { COLLECTIONS, getCollection } from "@/lib/mongo/client";
import type { CdtCodeDoc } from "@/lib/mongo/types";

type CdtCategoriesJson = {
  byCode: Record<
    string,
    {
      category?: string;
      description?: string;
      volumeBucket?: string;
      warrantyBucket?: string;
      isSoldCase?: boolean;
    }
  >;
  aoxSoldCodes?: string[];
};

const DEFAULT_JSON = join(
  process.cwd(),
  "src/lib/nexhealth/data/cdt-categories.json",
);

/** Merge Texoma Code Chart categories from bundled JSON into Mongo `cdt_codes`. */
export async function mergeCdtCategoriesFromJson(
  jsonPath = DEFAULT_JSON,
): Promise<{ updated: number; skipped: boolean }> {
  if (!existsSync(jsonPath)) {
    return { updated: 0, skipped: true };
  }

  const parsed = JSON.parse(readFileSync(jsonPath, "utf8")) as CdtCategoriesJson;
  const byCode = parsed.byCode ?? {};
  const aoxSold = new Set(parsed.aoxSoldCodes ?? []);
  const codes = Object.keys(byCode);
  if (codes.length === 0) return { updated: 0, skipped: false };

  const col = await getCollection<CdtCodeDoc>(COLLECTIONS.cdtCodes);
  let updated = 0;

  for (const code of codes) {
    const chart = byCode[code];
    if (!chart?.category) continue;

    const existing = await col.findOne({ code });
    const patch: Partial<CdtCodeDoc> = {
      category: chart.category,
    };
    if (chart.volumeBucket) patch.volumeBucket = chart.volumeBucket;
    if (chart.warrantyBucket) patch.warrantyBucket = chart.warrantyBucket;
    if (chart.isSoldCase || aoxSold.has(code)) {
      patch.isSoldCase = true;
      patch.isAox = chart.category === "Fixed (All-on-4)";
    }

    if (existing) {
      const res = await col.updateOne({ code }, { $set: patch });
      if (res.modifiedCount > 0) updated += 1;
    } else {
      const row: CdtCodeRow = {
        code,
        category: chart.category,
        description: chart.description ?? code,
        volumeBucket: chart.volumeBucket ?? null,
        warrantyBucket: chart.warrantyBucket ?? null,
        isAox: chart.category === "Fixed (All-on-4)",
        isSoldCase: patch.isSoldCase,
      };
      await col.updateOne(
        { code },
        {
          $set: {
            ...row,
            volumeBucket: row.volumeBucket ?? null,
            warrantyBucket: row.warrantyBucket ?? null,
            isAox: row.isAox ?? false,
          },
        },
        { upsert: true },
      );
      updated += 1;
    }
  }

  return { updated, skipped: false };
}
