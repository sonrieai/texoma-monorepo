import { NextResponse } from "next/server";
import { requireOwnerSession } from "@/lib/auth/require-dashboard-session";
import { validateNewPassword } from "@/lib/auth/password";
import { isDashboardRole, type DashboardRole } from "@/lib/auth/roles";
import {
  createDashboardUser,
  listDashboardUsers,
  toPublicUser,
} from "@/lib/auth/users";

export const dynamic = "force-dynamic";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function forbidden() {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

export async function GET() {
  const owner = await requireOwnerSession();
  if (!owner) return forbidden();

  const users = await listDashboardUsers();
  return NextResponse.json({ users: users.map(toPublicUser) });
}

type CreateBody = {
  username?: string;
  email?: string;
  password?: string;
  role?: string;
  providerId?: string | null;
};

export async function POST(request: Request) {
  const owner = await requireOwnerSession();
  if (!owner) return forbidden();

  let body: CreateBody;
  try {
    body = (await request.json()) as CreateBody;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const username = body.username?.trim() ?? "";
  const email = body.email?.trim().toLowerCase() ?? "";
  const password = body.password ?? "";
  if (!username) {
    return NextResponse.json({ error: "Name is required." }, { status: 400 });
  }
  if (!EMAIL_PATTERN.test(email)) {
    return NextResponse.json(
      { error: "A valid email address is required." },
      { status: 400 },
    );
  }
  const passwordError = validateNewPassword(password);
  if (passwordError) {
    return NextResponse.json({ error: passwordError }, { status: 400 });
  }
  if (!isDashboardRole(body.role)) {
    return NextResponse.json({ error: "Choose a role." }, { status: 400 });
  }

  const role: DashboardRole = body.role;
  const created = await createDashboardUser({
    username,
    email,
    password,
    role,
    providerId: body.providerId,
  });
  if (!created.ok) {
    return NextResponse.json({ error: created.error }, { status: created.status });
  }

  return NextResponse.json({ user: toPublicUser(created.user) }, { status: 201 });
}
