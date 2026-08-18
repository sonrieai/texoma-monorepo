import { NextResponse } from "next/server";
import { isPasswordResetConfigured } from "@/lib/auth/config";
import { validateNewPassword } from "@/lib/auth/password";
import { verifySignedResetToken } from "@/lib/auth/reset-token";
import {
  ensureAuthIndexes,
  findDashboardUserById,
  findPasswordResetByToken,
  markPasswordResetUsed,
  updateDashboardUserPassword,
} from "@/lib/auth/users";

export const dynamic = "force-dynamic";

type ResetPasswordBody = {
  resetToken?: string;
  newPassword?: string;
};

export async function POST(request: Request) {
  if (!isPasswordResetConfigured()) {
    return NextResponse.json(
      { ok: false, error: "Password reset is not configured." },
      { status: 503 },
    );
  }

  let body: ResetPasswordBody;
  try {
    body = (await request.json()) as ResetPasswordBody;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid request body" },
      { status: 400 },
    );
  }

  const resetToken = body.resetToken?.trim() ?? "";
  const newPassword = body.newPassword ?? "";

  if (!resetToken || !newPassword) {
    return NextResponse.json(
      { ok: false, error: "Reset token and new password are required." },
      { status: 400 },
    );
  }

  const passwordError = validateNewPassword(newPassword);
  if (passwordError) {
    return NextResponse.json({ ok: false, error: passwordError }, { status: 400 });
  }

  await ensureAuthIndexes();

  let tokenData;
  try {
    tokenData = verifySignedResetToken(resetToken);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Invalid or expired reset token.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }

  const resetRecord = await findPasswordResetByToken(resetToken);
  if (!resetRecord) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Invalid or expired reset token. Please request a new password reset link.",
      },
      { status: 400 },
    );
  }

  if (resetRecord.isUsed) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "This password reset link has already been used. Please request a new link.",
      },
      { status: 400 },
    );
  }

  if (resetRecord.expiresAt.getTime() < Date.now()) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "This password reset link has expired. Please request a new link.",
      },
      { status: 400 },
    );
  }

  if (
    resetRecord.userId !== tokenData.user_id ||
    resetRecord.email !== tokenData.email
  ) {
    return NextResponse.json(
      { ok: false, error: "Invalid reset token." },
      { status: 400 },
    );
  }

  const user = await findDashboardUserById(tokenData.user_id);
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "Dashboard account not found." },
      { status: 404 },
    );
  }

  const updated = await updateDashboardUserPassword(user.id, newPassword);
  if (!updated) {
    return NextResponse.json(
      { ok: false, error: "Failed to update password." },
      { status: 500 },
    );
  }

  await markPasswordResetUsed(resetToken);

  return NextResponse.json({
    ok: true,
    success: true,
    redirectTo: "/login",
    message: "Password updated successfully.",
  });
}
