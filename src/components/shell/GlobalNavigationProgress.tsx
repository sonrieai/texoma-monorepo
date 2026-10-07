"use client";

import { Suspense, useEffect, useSyncExternalStore } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { InlineSpinner } from "@/components/ui/States";
import {
  clearNavigationPending,
  getNavigationPendingHref,
  subscribeNavigationPending,
} from "@/lib/ui/navigation-pending";

function NavigationProgressInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const pendingHref = useSyncExternalStore(
    subscribeNavigationPending,
    getNavigationPendingHref,
    () => null,
  );
  useEffect(() => {
    clearNavigationPending();
  }, [pathname, searchParams]);

  if (!pendingHref) return null;

  return (
    <>
      <div
        className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-1 overflow-hidden bg-line"
        role="progressbar"
        aria-label="Loading page"
        aria-busy="true"
      >
        <div className="nav-progress-indeterminate h-full bg-accent2" />
      </div>
      <div
        className="pointer-events-none fixed bottom-4 right-4 z-[100] flex items-center gap-2 rounded-lg border border-line bg-card px-3 py-2 shadow-lg"
        role="status"
        aria-live="polite"
      >
        <InlineSpinner size="sm" className="border-muted/40 border-t-accent2" />
        <span className="text-[12px] font-semibold text-foreground">
          Loading page…
        </span>
      </div>
    </>
  );
}

export function GlobalNavigationProgress() {
  return (
    <Suspense fallback={null}>
      <NavigationProgressInner />
    </Suspense>
  );
}
