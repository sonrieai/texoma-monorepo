import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getSessionCookieName } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export async function POST() {
  const cookieStore = await cookies();
  cookieStore.set(getSessionCookieName(), "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });

  return NextResponse.json({ ok: true });
}
