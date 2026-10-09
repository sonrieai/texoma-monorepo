import { NextResponse } from "next/server";
import {
  isPasswordResetConfigured,
  PASSWORD_RESET_MAX_REQUESTS_PER_EMAIL,
  PASSWORD_RESET_RATE_WINDOW_MS,
} from "@/lib/auth/config";
import {
  buildPasswordResetUrl,
  getPasswordResetWebBaseUrl,
  sendPasswordResetEmail,
} from "@/lib/auth/mailgun";
import { createSignedResetToken, getResetTokenTtlMs } from "@/lib/auth/reset-token";
import {
  countRecentPasswordResetRequests,
  ensureAuthIndexes,
  findDashboardUserByEmail,
  insertPasswordResetRecord,
} from "@/lib/auth/users";

export const dynamic = "force-dynamic";

type ForgotPasswordBody = {
  email?: string;
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request) {
  if (!isPasswordResetConfigured()) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Password reset is not configured. Set AUTH_EMAIL, AUTH_SESSION_SECRET, and MAILGUN_API_KEY.",
      },
      { status: 503 },
    );
  }

  let body: ForgotPasswordBody;
  try {
    body = (await request.json()) as ForgotPasswordBody;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid request body" },
      { status: 400 },
    );
  }

  const email = body.email?.trim().toLowerCase() ?? "";
  if (!email || !EMAIL_PATTERN.test(email)) {
    return NextResponse.json(
      { ok: false, error: "A valid email address is required." },
      { status: 400 },
    );
  }

  await ensureAuthIndexes();

  const recentCount = await countRecentPasswordResetRequests(
    email,
    PASSWORD_RESET_RATE_WINDOW_MS,
  );
  if (recentCount >= PASSWORD_RESET_MAX_REQUESTS_PER_EMAIL) {
    return NextResponse.json(
      {
        ok: false,
        error: "Too many password reset attempts. Please try again later.",
      },
      { status: 429 },
    );
  }

  const user = await findDashboardUserByEmail(email);
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "No dashboard account found for that email." },
      { status: 404 },
    );
  }

  const resetToken = createSignedResetToken({
    userId: user.id,
    email: user.email,
  });
  const expiresAt = new Date(Date.now() + getResetTokenTtlMs());
  await insertPasswordResetRecord({
    userId: user.id,
    email: user.email,
    resetToken,
    expiresAt,
  });

  const origin = new URL(request.url).origin;
  const resetUrl = buildPasswordResetUrl(
    resetToken,
    getPasswordResetWebBaseUrl(origin),
  );

  const emailSent = await sendPasswordResetEmail({
    email: user.email,
    userName: user.username,
    resetUrl,
  });

  if (!emailSent) {
    return NextResponse.json(
      {
        ok: false,
        error: "Unable to send password reset email. Please try again later.",
      },
      { status: 503 },
    );
  }

  return NextResponse.json({
    ok: true,
    emailSent: true,
    message: `Password reset link sent to ${user.email}.`,
  });
}
