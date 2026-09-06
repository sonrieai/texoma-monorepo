"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { InlineSpinner } from "@/components/ui/States";

type LogoutButtonProps = {
  variant?: "topbar" | "sidebar";
};

function LogOutIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}

export function LogoutButton({ variant = "topbar" }: LogoutButtonProps) {
  const router = useRouter();
  const [status, setStatus] = useState<"loading" | "hidden" | "ready">("loading");
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/me")
      .then((response) => response.json())
      .then((data: { authenticated?: boolean; enabled?: boolean }) => {
        if (cancelled) return;
        setStatus(data.enabled && data.authenticated ? "ready" : "hidden");
      })
      .catch(() => {
        if (!cancelled) setStatus("hidden");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function onLogout() {
    setSigningOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      router.replace("/login");
      router.refresh();
    } finally {
      setSigningOut(false);
    }
  }

  if (status === "hidden" || status === "loading") return null;

  const isSidebar = variant === "sidebar";

  return (
    <button
      type="button"
      onClick={onLogout}
      disabled={signingOut}
      aria-label={signingOut ? "Signing out" : "Sign out"}
      aria-busy={signingOut}
      className={
        isSidebar
          ? "flex w-full cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-[13px] font-medium text-sidebar-text transition-colors hover:bg-sidebar-2 disabled:cursor-not-allowed disabled:opacity-60"
          : "inline-flex h-9 shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-line bg-background px-2.5 text-[11.5px] font-semibold text-muted transition hover:border-accent2/30 hover:bg-badge-bg/40 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60 sm:px-3"
      }
    >
      {signingOut ? (
        <InlineSpinner size="xs" />
      ) : (
        <>
          <LogOutIcon className="h-4 w-4 shrink-0" />
          <span className={isSidebar ? "truncate" : "hidden sm:inline"}>
            Sign out
          </span>
        </>
      )}
    </button>
  );
}
