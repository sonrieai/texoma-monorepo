"use client";

import { useCallback, useEffect, useState } from "react";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";

type Props = {
  title: string;
  subtitle?: string;
  badge?: string;
  children: React.ReactNode;
};

export function AppShell({ title, subtitle, badge, children }: Props) {
  const [navOpen, setNavOpen] = useState(false);
  const closeNav = useCallback(() => setNavOpen(false), []);
  const openNav = useCallback(() => setNavOpen(true), []);

  useEffect(() => {
    if (!navOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [navOpen]);

  return (
    <div className="flex h-dvh overflow-hidden bg-background">
      <Sidebar open={navOpen} onClose={closeNav} />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <Topbar
          title={title}
          subtitle={subtitle}
          badge={badge}
          onMenuClick={openNav}
        />
        <main className="animate-fade-up min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <div className="mx-auto w-full max-w-[1200px] px-3.5 pb-10 pt-3.5 sm:px-6 sm:pb-12 sm:pt-4">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
