/** GoHighLevel user ids for treatment coordinators (Change Spec item 7). */
export const COORDINATOR_GHL_USER_IDS: Record<string, string> = {
  ashlie: process.env.GHL_COORDINATOR_ASHLIE_USER_ID?.trim() || "9aIuM8iB5oX6dTHXh262",
  brie: process.env.GHL_COORDINATOR_BRIE_USER_ID?.trim() || "MZpXcUFbXCGyFQNIoVLP",
};

export function coordinatorGhlUserId(slug: string): string | null {
  const key = slug.trim().toLowerCase();
  if (key.includes("ashlie")) return COORDINATOR_GHL_USER_IDS.ashlie;
  if (key.includes("brie")) return COORDINATOR_GHL_USER_IDS.brie;
  return null;
}
