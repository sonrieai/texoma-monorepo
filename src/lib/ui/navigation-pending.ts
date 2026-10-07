/** Module-level nav state so feedback survives full-page RSC swaps. */

let pendingHref: string | null = null;
const listeners = new Set<() => void>();

export function getNavigationPendingHref(): string | null {
  return pendingHref;
}

export function beginNavigation(href: string): void {
  pendingHref = href;
  for (const listener of listeners) listener();
}

export function clearNavigationPending(): void {
  if (pendingHref == null) return;
  pendingHref = null;
  for (const listener of listeners) listener();
}

export function subscribeNavigationPending(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function pathFromHref(href: string): string {
  const q = href.indexOf("?");
  return q >= 0 ? href.slice(0, q) : href;
}
