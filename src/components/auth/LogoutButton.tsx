"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

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

function ButtonSpinner({ className }: { className?: string }) {
  return (
    <span
      className={`inline-block animate-spin rounded-full border-2 border-current border-t-transparent ${className ?? "h-4 w-4"}`}
      aria-hidden
    />
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

  if (status === "hidden") return null;

  const isSidebar = variant === "sidebar";

  if (status === "loading") {
    return (
      <div
        className={
          isSidebar
            ? "flex items-center gap-2 rounded-lg px-2.5 py-2 text-sidebar-muted"
            : "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-line bg-background text-muted sm:w-auto sm:min-w-[7.5rem] sm:px-3"
        }
        aria-hidden
      >
        <ButtonSpinner className={isSidebar ? "h-4 w-4" : "h-4 w-4"} />
        <span
          className={
            isSidebar
              ? "text-[12.5px]"
              : "hidden text-[11.5px] font-semibold sm:inline"
          }
        >
          Checking…
        </span>
      </div>
    );
  }

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
        <ButtonSpinner className="h-4 w-4 shrink-0" />
      ) : (
        <LogOutIcon className="h-4 w-4 shrink-0" />
      )}
      <span className={isSidebar ? "truncate" : "hidden sm:inline"}>
        {signingOut ? "Signing out…" : "Sign out"}
      </span>
    </button>
  );
}
