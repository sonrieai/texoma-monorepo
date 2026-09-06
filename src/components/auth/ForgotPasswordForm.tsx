"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { InlineSpinner } from "@/components/ui/States";

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const response = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = (await response.json()) as {
        ok?: boolean;
        error?: string;
        message?: string;
      };

      if (!response.ok || !data.ok) {
        setError(data.error ?? "Unable to send reset link.");
        return;
      }

      setEmailSent(true);
    } catch {
      setError("Unable to send reset link. Try again.");
    } finally {
      setLoading(false);
    }
  }

  if (emailSent) {
    return (
      <div className="space-y-4 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-badge-bg text-xl text-accent2">
          ✉
        </div>
        <div>
          <h2 className="m-0 text-[15px] font-semibold text-foreground">
            Reset link sent
          </h2>
          <p className="m-0 mt-2 text-[12.5px] leading-relaxed text-muted">
            If an account exists for <strong>{email}</strong>, a reset link is on
            its way. Check spam if you do not see it within a few minutes.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setEmailSent(false)}
          className="text-[12.5px] font-semibold text-accent2 hover:underline"
        >
          Try again
        </button>
        <div>
          <Link
            href="/login"
            className="text-[12.5px] font-semibold text-muted hover:text-foreground"
          >
            Back to sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form className="space-y-4" onSubmit={onSubmit}>
      <div>
        <label
          htmlFor="email"
          className="mb-1.5 block text-[12px] font-semibold text-foreground"
        >
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="w-full rounded-lg border border-line bg-background px-3 py-2.5 text-[13px] text-foreground outline-none ring-accent/30 transition focus:ring-2"
          placeholder="you@practice.com"
        />
      </div>

      {error ? (
        <p className="rounded-lg border border-bad/20 bg-bad/5 px-3 py-2 text-[12px] text-bad">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={loading}
        aria-busy={loading}
        aria-label={loading ? "Sending reset link" : undefined}
        className="flex w-full items-center justify-center rounded-lg bg-accent2 px-3 py-2.5 text-[13px] font-semibold text-white transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading ? (
          <InlineSpinner className="border-white/30 border-t-white" />
        ) : (
          "Send reset link"
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
