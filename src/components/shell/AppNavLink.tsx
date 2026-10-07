"use client";

import Link from "next/link";
import { useLinkStatus } from "next/link";
import type { ReactNode } from "react";
import { InlineSpinner } from "@/components/ui/States";
import { beginNavigation } from "@/lib/ui/navigation-pending";

type Props = {
  href: string;
  className?: string;
  children: ReactNode;
  onNavigate?: () => void;
};

export function AppNavLink({ href, className, children, onNavigate }: Props) {
  return (
    <Link
      href={href}
      className={className}
      onClick={() => {
        beginNavigation(href);
        onNavigate?.();
      }}
    >
      {children}
    </Link>
  );
}

/** Must be rendered inside AppNavLink. */
export function AppNavLinkSpinner({
  fallback,
  className,
}: {
  fallback: ReactNode;
  className?: string;
}) {
  const { pending } = useLinkStatus();
  if (!pending) return <>{fallback}</>;
  return (
    <InlineSpinner
      size="xs"
      className={className ?? "shrink-0 border-white/30 border-t-white"}
    />
  );
}
