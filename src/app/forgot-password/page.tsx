import { AuthPageHeader } from "@/components/auth/AuthPageHeader";
import { ForgotPasswordForm } from "@/components/auth/ForgotPasswordForm";

export const dynamic = "force-dynamic";

export default function ForgotPasswordPage() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-[420px]">
        <AuthPageHeader
          title="Forgot password"
          subtitle="Enter your dashboard email and we'll send a reset link."
        />

        <div className="rounded-2xl border border-line bg-card p-5 shadow-sm sm:p-6">
          <ForgotPasswordForm />
        </div>
      </div>
    </div>
  );
}
