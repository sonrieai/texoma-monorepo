import type { ReactNode } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { PageLoading } from "@/components/ui/States";
import type { NavProfile } from "@/lib/auth/nav-profile";
import {
  enforceCurrentPage,
  loadNavProfile,
} from "@/lib/auth/require-dashboard-session";
import { DataFreshnessBadge } from "@/components/shell/DataFreshnessBadge";

/** Shown while a route loads. The finished page replaces this with the real role. */
const LOADING_NAV: NavProfile = {
  enabled: true,
  authenticated: false,
  role: null,
  providerId: null,
};

type Props = {
  title: string;
  subtitle?: ReactNode;
  badge?: ReactNode;
  children: React.ReactNode;
};

/** Server shell. The sidebar is rendered from the signed-in role. */
export async function DashboardFrame(props: Props) {
  await enforceCurrentPage();
  const navProfile = await loadNavProfile();
  const subtitle = props.subtitle ? (
    <span className="inline">
      {props.subtitle}
      <span className="hidden sm:inline">
        {" · "}
        <DataFreshnessBadge />
      </span>
    </span>
  ) : (
    <DataFreshnessBadge />
  );
  return <AppShell {...props} subtitle={subtitle} navProfile={navProfile} />;
}

export async function DashboardLoading(props: {
  title: string;
  subtitle?: string;
  label?: string;
}) {
  const navProfile = await loadNavProfile();
  return <PageLoading {...props} navProfile={navProfile} />;
}
