import { AuthPageHeader } from "@/components/auth/AuthPageHeader";
import { LoginForm } from "@/components/auth/LoginForm";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-[420px]">
        <AuthPageHeader
          title="Texoma Dentures & Implants"
          subtitle="Sign in to view practice KPIs and patient analytics."
        />

        <div className="rounded-2xl border border-line bg-card p-5 shadow-sm sm:p-6">
          <LoginForm />
        </div>
      </div>
    </div>
  );
}
