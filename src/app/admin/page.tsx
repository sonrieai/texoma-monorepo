import { redirect } from "next/navigation";
import { AdminUsersPanel } from "@/components/admin/AdminUsersPanel";
import { DashboardFrame } from "@/components/shell/DashboardFrame";
import { getDashboardAccess } from "@/lib/auth/require-dashboard-session";
import { listDashboardUsers, toPublicUser } from "@/lib/auth/users";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const access = await getDashboardAccess();
  if (!access) redirect("/login");
  if (access.role !== "owner") redirect(access.homePath);

  const users = (await listDashboardUsers()).map(toPublicUser);

  return (
    <DashboardFrame
      title="Admin"
      subtitle="Create dashboard users and assign what each role can open."
    >
      <AdminUsersPanel initialUsers={users} />
    </DashboardFrame>
  );
}
