import "server-only";

import { isAuthEnabled } from "@/lib/auth/config";
import {
  ensureAuthIndexes,
  ensureDashboardAdminFromEnv,
  findDashboardUserByEmail,
  verifyDashboardUserPassword,
} from "@/lib/auth/users";

export type VerifiedLogin = {
  email: string;
  userId: string;
};

export async function verifyLogin(
  email: string,
  password: string,
): Promise<VerifiedLogin | null> {
  if (!isAuthEnabled()) return null;

  await ensureAuthIndexes();
  await ensureDashboardAdminFromEnv();

  const user = await findDashboardUserByEmail(email);
  if (!user) return null;
  if (!(await verifyDashboardUserPassword(user, password))) return null;

  return { email: user.email, userId: user.id };
}
