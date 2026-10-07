/** Default page size for dashboard list UIs. */
export const LIST_PAGE_SIZE = 8;

/** Cities table on Patients by Area. */
export const GEO_CITY_PAGE_SIZE = 12;

export function pageCount(total: number, pageSize = LIST_PAGE_SIZE): number {
  if (total <= 0) return 0;
  return Math.ceil(total / pageSize);
}

export function slicePage<T>(
  items: readonly T[],
  page: number,
  pageSize = LIST_PAGE_SIZE,
): T[] {
  const safePage = Math.max(1, page);
  const start = (safePage - 1) * pageSize;
  return items.slice(start, start + pageSize);
}
