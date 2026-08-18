import { NextResponse } from "next/server";
import { isNexHealthDebugEnabled } from "@/lib/nexhealth/logger";
import {
  isNexHealthProxyResource,
  runNexHealthProxy,
  validateProxyParams,
} from "@/lib/nexhealth/proxy";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ resource: string }> };

/**
 * GET /api/nexhealth/{resource}
 * Swagger-friendly NexHealth proxy (raw upstream JSON).
 * Requires NEXHEALTH_DEBUG=1 (or development).
 */
export async function GET(request: Request, context: RouteContext) {
  if (!isNexHealthDebugEnabled()) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "NexHealth proxy is disabled. Set NEXHEALTH_DEBUG=1 in .env.local and restart.",
      },
      { status: 403 },
    );
  }

  const { resource: rawResource } = await context.params;
  const resource = rawResource.toLowerCase();

  if (!isNexHealthProxyResource(resource)) {
    return NextResponse.json(
      {
        ok: false,
        error: `Unknown resource "${rawResource}".`,
        allowed: [
          "health",
          "locations",
          "providers",
          "patients",
          "appointments",
          "appointment_types",
          "procedures",
          "charges",
          "payments",
          "adjustments",
          "treatment_plans",
          "guarantor_balances",
        ],
      },
      { status: 404 },
    );
  }

  const searchParams = new URL(request.url).searchParams;
  const validationError = validateProxyParams(resource, searchParams);
  if (validationError) {
    return NextResponse.json({ ok: false, error: validationError }, { status: 400 });
  }

  try {
    const result = await runNexHealthProxy(resource, searchParams);
    if ("error" in result) {
      return NextResponse.json({ ok: false, error: result.error }, { status: 503 });
    }
    return NextResponse.json(result, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        error: e instanceof Error ? e.message : "NexHealth request failed",
      },
      { status: 502 },
    );
  }
}
