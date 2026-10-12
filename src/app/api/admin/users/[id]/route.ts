import { NextResponse } from "next/server";
import { requireOwnerSession } from "@/lib/auth/require-dashboard-session";
import { isDashboardRole, type DashboardRole } from "@/lib/auth/roles";
import { toPublicUser, updateDashboardUserAccess } from "@/lib/auth/users";

export const dynamic = "force-dynamic";

type UpdateBody = {
  role?: string;
  providerId?: string | null;
  isActive?: boolean;
};

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const owner = await requireOwnerSession();
  if (!owner) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await context.params;
  if (!id) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }

  let body: UpdateBody;
  try {
    body = (await request.json()) as UpdateBody;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  let role: DashboardRole | undefined;
  if (body.role !== undefined) {
    if (!isDashboardRole(body.role)) {
      return NextResponse.json({ error: "Choose a role." }, { status: 400 });
    }
    role = body.role;
  }

  if (body.isActive !== undefined && typeof body.isActive !== "boolean") {
    return NextResponse.json({ error: "Active must be true or false." }, { status: 400 });
  }

  if (
    role === undefined &&
    body.providerId === undefined &&
    body.isActive === undefined
  ) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }

  const updated = await updateDashboardUserAccess(id, {
    role,
    providerId: body.providerId,
    isActive: body.isActive,
  });
  if (!updated.ok) {
    return NextResponse.json({ error: updated.error }, { status: updated.status });
  }

  return NextResponse.json({ user: toPublicUser(updated.user) });
}
