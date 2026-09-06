"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState, type FormEvent } from "react";
import { InlineSpinner, Spinner } from "@/components/ui/States";

function passwordChecks(password: string) {
  return {
    length: password.length >= 8,
    lower: /(?=.*[a-z])/.test(password),
    upper: /(?=.*[A-Z])/.test(password),
    number: /(?=.*\d)/.test(password),
  };
}

function ResetPasswordFormInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const resetToken = searchParams.get("token")?.trim() ?? "";

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const checks = useMemo(() => passwordChecks(newPassword), [newPassword]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!resetToken) {
      setError("Invalid reset link. Request a new password reset email.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resetToken, newPassword }),
      });
      const data = (await response.json()) as {
        ok?: boolean;
        error?: string;
        redirectTo?: string;
      };

      if (!response.ok || !data.ok) {
        setError(data.error ?? "Unable to reset password.");
        return;
      }

      setSuccess(true);
      window.setTimeout(() => {
        router.replace(data.redirectTo || "/login");
      }, 2500);
    } catch {
      setError("Unable to reset password. Try again.");
    } finally {
      setLoading(false);
    }
  }

  if (!resetToken) {
    return (
      <div className="space-y-4 text-center">
        <p className="m-0 text-[13px] text-bad">
          This reset link is invalid or incomplete.
        </p>
        <Link
          href="/forgot-password"
          className="text-[12.5px] font-semibold text-accent2 hover:underline"
        >
          Request a new reset link
        </Link>
      </div>
    );
  }

  if (success) {
    return (
      <div className="space-y-4 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-good/10 text-xl text-good">
          ✓
        </div>
        <div>
          <h2 className="m-0 text-[15px] font-semibold text-foreground">
            Password updated
          </h2>
          <p className="m-0 mt-2 text-[12.5px] text-muted">
            Redirecting you to sign in…
          </p>
        </div>
        <Link
          href="/login"
          className="text-[12.5px] font-semibold text-accent2 hover:underline"
        >
          Continue to sign in
        </Link>
      </div>
    );
  }

  return (
    <form className="space-y-4" onSubmit={onSubmit}>
      <div>
        <label
          htmlFor="new-password"
          className="mb-1.5 block text-[12px] font-semibold text-foreground"
        >
          New password
        </label>
        <input
          id="new-password"
          name="newPassword"
          type="password"
          autoComplete="new-password"
          required
          value={newPassword}
          onChange={(event) => setNewPassword(event.target.value)}
          className="w-full rounded-lg border border-line bg-background px-3 py-2.5 text-[13px] text-foreground outline-none ring-accent/30 transition focus:ring-2"
        />
      </div>

      <div>
        <label
          htmlFor="confirm-password"
          className="mb-1.5 block text-[12px] font-semibold text-foreground"
        >
          Confirm new password
        </label>
        <input
          id="confirm-password"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          required
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          className="w-full rounded-lg border border-line bg-background px-3 py-2.5 text-[13px] text-foreground outline-none ring-accent/30 transition focus:ring-2"
        />
      </div>

      <ul className="space-y-1 rounded-lg border border-line bg-background px-3 py-2.5 text-[11.5px] text-muted">
        <li className={checks.length ? "text-good" : ""}>At least 8 characters</li>
        <li className={checks.lower ? "text-good" : ""}>One lowercase letter</li>
        <li className={checks.upper ? "text-good" : ""}>One uppercase letter</li>
        <li className={checks.number ? "text-good" : ""}>One number</li>
      </ul>

      {error ? (
        <p className="rounded-lg border border-bad/20 bg-bad/5 px-3 py-2 text-[12px] text-bad">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={loading}
        aria-busy={loading}
        aria-label={loading ? "Updating password" : undefined}
        className="flex w-full items-center justify-center rounded-lg bg-accent2 px-3 py-2.5 text-[13px] font-semibold text-white transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading ? (
          <InlineSpinner className="border-white/30 border-t-white" />
        ) : (
          "Reset password"
        )}
      </button>

      <div className="text-center">
        <Link
          href="/login"
          className="text-[12.5px] font-semibold text-muted hover:text-foreground"
        >
          Back to sign in
        </Link>
      </div>
    </form>
  );
}

export function ResetPasswordForm() {
  return (
    <Suspense fallback={<Spinner size="sm" />}>
      <ResetPasswordFormInner />
    </Suspense>
  );
}
