import type { DashboardRole } from "@/lib/auth/roles";

export type NavProfile = {
  enabled: boolean;
  authenticated: boolean;
  role: DashboardRole | null;
  providerId: string | null;
};
