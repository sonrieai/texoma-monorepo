"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState, type FormEvent } from "react";
import { InlineSpinner, Spinner } from "@/components/ui/States";

function LoginFormInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") || "/overview";
  const timeoutReason = searchParams.get("reason");

  const timeoutMessage =
    timeoutReason === "timeout"
      ? "Your session ended after 10 minutes of inactivity. Please sign in again."
      : timeoutReason === "expired"
        ? "Your session has expired. Please sign in again."
        : null;

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = (await response.json()) as { ok?: boolean; error?: string };

      if (!response.ok || !data.ok) {
        setError(data.error ?? "Unable to sign in");
        return;
      }

      router.replace(callbackUrl);
      router.refresh();
    } catch {
      setError("Unable to sign in. Try again.");
    } finally {
      setLoading(false);
    }
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
          placeholder="you@practice.com"
          className="w-full rounded-lg border border-line bg-background px-3 py-2.5 text-[13px] text-foreground outline-none ring-accent/30 transition focus:ring-2"
        />
      </div>

      <div>
        <label
          htmlFor="password"
          className="mb-1.5 block text-[12px] font-semibold text-foreground"
        >
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="w-full rounded-lg border border-line bg-background px-3 py-2.5 text-[13px] text-foreground outline-none ring-accent/30 transition focus:ring-2"
        />
      </div>

      {timeoutMessage ? (
        <p className="rounded-lg border border-warn/20 bg-warn/5 px-3 py-2 text-[12px] text-warn">
          {timeoutMessage}
        </p>
      ) : null}

      {error ? (
        <p className="rounded-lg border border-bad/20 bg-bad/5 px-3 py-2 text-[12px] text-bad">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={loading}
        aria-busy={loading}
        aria-label={loading ? "Signing in" : undefined}
        className="flex w-full items-center justify-center rounded-lg bg-accent2 px-3 py-2.5 text-[13px] font-semibold text-white transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading ? (
          <InlineSpinner className="border-white/30 border-t-white" />
        ) : (
          "Sign in"
        )}
      </button>

      <div className="text-center">
        <Link
          href="/forgot-password"
          className="text-[12.5px] font-semibold text-accent2 hover:underline"
        >
          Forgot password?
        </Link>
      </div>
    </form>
  );
}

export function LoginForm() {
  return (
    <Suspense fallback={<Spinner size="sm" />}>
      <LoginFormInner />
    </Suspense>
  );
}
