import "server-only";

import { landingPath, type DashboardRole } from "@/lib/auth/roles";
import { findActiveDashboardUserByEmail } from "@/lib/auth/users";

export type DashboardAccess = {
  email: string;
  role: DashboardRole | null;
  providerId: string | null;
  homePath: string;
};

export async function accessForEmail(
  email: string,
): Promise<DashboardAccess | null> {
  const user = await findActiveDashboardUserByEmail(email);
  if (!user) return null;

  return {
    email: user.email,
    role: user.role,
    providerId: user.providerId,
    homePath: landingPath(user.role, user.providerId),
  };
}
