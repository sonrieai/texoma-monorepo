"use client";

import type { ReactNode } from "react";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { SessionActivityGuard } from "@/components/auth/SessionActivityGuard";
import { LoadingBox } from "@/components/ui/States";
import {
  getNavigationPendingHref,
  subscribeNavigationPending,
} from "@/lib/ui/navigation-pending";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";

type Props = {
  title: string;
  subtitle?: string;
  badge?: ReactNode;
  children: React.ReactNode;
};

export function AppShell({ title, subtitle, badge, children }: Props) {
  const [navOpen, setNavOpen] = useState(false);
  const closeNav = useCallback(() => setNavOpen(false), []);
  const openNav = useCallback(() => setNavOpen(true), []);
  const pendingHref = useSyncExternalStore(
    subscribeNavigationPending,
    getNavigationPendingHref,
    () => null,
  );
  const isNavigating = pendingHref != null;

  useEffect(() => {
    if (!navOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [navOpen]);

  return (
    <SessionActivityGuard>
      <div className="flex h-dvh overflow-hidden bg-background">
        <Sidebar open={navOpen} onClose={closeNav} />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <Topbar
            title={title}
            subtitle={subtitle}
            badge={badge}
            onMenuClick={openNav}
          />
          <main
            className={`relative min-h-0 flex-1 overflow-y-auto overscroll-contain ${isNavigating ? "" : "animate-fade-up"}`}
            aria-busy={isNavigating}
          >
            {isNavigating ? (
              <div
                className="pointer-events-none absolute inset-0 z-10 bg-background/35"
                aria-hidden
              />
            ) : null}
            <div
              className={`mx-auto w-full max-w-[1200px] px-3.5 pb-10 pt-3.5 sm:px-6 sm:pb-12 sm:pt-4 ${isNavigating ? "opacity-60" : ""}`}
            >
              {isNavigating ? (
                <LoadingBox className="pointer-events-none absolute inset-x-0 top-8 z-20 py-4" />
              ) : null}
              {children}
            </div>
          </main>
        </div>
      </div>
    </SessionActivityGuard>
  );
}
