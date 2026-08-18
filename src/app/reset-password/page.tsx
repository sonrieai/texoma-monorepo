import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";

export const dynamic = "force-dynamic";

export default function ResetPasswordPage() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-[420px]">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-sidebar text-lg font-bold text-white">
            T
          </div>
          <h1 className="font-display m-0 text-[1.65rem] font-semibold text-foreground">
            Reset password
          </h1>
          <p className="m-0 mt-2 text-[13px] text-muted">
            Choose a new password for your dashboard account.
          </p>
        </div>

        <div className="rounded-2xl border border-line bg-card p-5 shadow-sm sm:p-6">
          <ResetPasswordForm />
        </div>
      </div>
    </div>
  );
}
