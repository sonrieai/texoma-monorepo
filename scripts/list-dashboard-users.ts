/**
 * Item 6 — list stored dashboard users and roles for explicit assignment (read-only).
 */
import { loadEnvLocal } from "../src/lib/env/load-env-local";
import { listDashboardUsers } from "../src/lib/auth/users";
import { roleLabel, normalizeDashboardRole } from "../src/lib/auth/roles";

loadEnvLocal();

async function main() {
  const users = await listDashboardUsers();
  console.log("Dashboard users (assign roles explicitly in Admin):");
  for (const u of users) {
    const role = normalizeDashboardRole(u.role);
    console.log(
      `  ${u.email}  role=${role} (${roleLabel(role)})  active=${u.isActive}`,
    );
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
