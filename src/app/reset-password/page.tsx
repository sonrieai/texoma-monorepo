import { AuthPageHeader } from "@/components/auth/AuthPageHeader";
import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";

export const dynamic = "force-dynamic";

export default function ResetPasswordPage() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-[420px]">
        <AuthPageHeader
          title="Reset password"
          subtitle="Choose a new password for your dashboard account."
        />

        <div className="rounded-2xl border border-line bg-card p-5 shadow-sm sm:p-6">
          <ResetPasswordForm />
        </div>
      </div>
    </div>
  );
}
