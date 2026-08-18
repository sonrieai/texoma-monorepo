import { notFound } from "next/navigation";
import { SwaggerPanel } from "@/components/api-docs/SwaggerPanel";
import { isNexHealthDebugEnabled } from "@/lib/nexhealth/logger";
import "@/app/api-docs/swagger.css";

export const dynamic = "force-dynamic";

export default function NexHealthApiDocsPage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  const debugEnabled = isNexHealthDebugEnabled();

  return (
    <div className="min-h-screen bg-[#0f1419] text-[#e8eaed]">
      <header className="border-b border-white/10 px-6 py-4">
        <h1 className="text-xl font-semibold">NexHealth API explorer</h1>
        <p className="mt-1 max-w-3xl text-sm text-white/70">
          Swagger UI for checking NexHealth / Open Dental API responses only.
          Each endpoint proxies upstream NexHealth — dashboard Route Handlers are
          not listed here.
        </p>
        {!debugEnabled ? (
          <p className="mt-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
            <strong>Try it out</strong> is disabled. Set{" "}
            <code className="rounded bg-black/30 px-1">NEXHEALTH_DEBUG=1</code> in
            `.env.local` and restart the dev server.
          </p>
        ) : (
          <p className="mt-2 text-sm text-emerald-300/90">
            NexHealth proxy enabled — responses return raw upstream JSON.
          </p>
        )}
      </header>
      <div className="nexhealth-swagger px-4 py-6">
        <SwaggerPanel />
      </div>
    </div>
  );
}
