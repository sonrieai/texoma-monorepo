import { NextResponse } from "next/server";
import { getNexHealthConfig, healthCheck, mapAttendance } from "@/lib/nexhealth/client";
import { isNexHealthDebugEnabled } from "@/lib/nexhealth/logger";
import {
  NEXHEALTH_PROXY_RESOURCES,
  runNexHealthProxy,
  type NexHealthProxyResource,
} from "@/lib/nexhealth/proxy";

export const dynamic = "force-dynamic";

function sampleItems(items: unknown[], limit = 3): unknown[] {
  return items.slice(0, limit);
}

/**
 * Dev JSON inspector for NexHealth endpoints.
 * GET /api/debug/nexhealth
 * Requires NEXHEALTH_DEBUG=1 (or development default).
 */
export async function GET() {
  if (!isNexHealthDebugEnabled()) {
    return NextResponse.json(
      {
        ok: false,
        message:
          "Debug JSON is disabled. Set NEXHEALTH_DEBUG=1 in .env.local and restart.",
      },
      { status: 403 },
    );
  }

  const config = getNexHealthConfig();
  if (!config) {
    return NextResponse.json(
      { ok: false, message: "NEXHEALTH_API_KEY is not configured" },
      { status: 503 },
    );
  }

  const range = {
    start: new Date(Date.now() - 365 * 86_400_000).toISOString(),
    end: new Date().toISOString(),
  };
  const health = await healthCheck();

  const endpoints: Record<
    string,
    {
      method: string;
      path: string;
      query: Record<string, string | number | boolean>;
      ok: boolean;
      count?: number;
      error?: string;
      sample?: unknown;
      attendanceRollup?: Record<string, number>;
    }
  > = {};

  for (const resource of NEXHEALTH_PROXY_RESOURCES) {
    if (resource === "health") {
      endpoints.health = {
        method: "POST",
        path: "/authenticates",
        query: {
          subdomain: config.subdomain,
          location_id: config.locationId,
        },
        ok: health.ok,
        count: health.ok ? 1 : 0,
        error: health.ok ? undefined : health.message,
        sample: health,
      };
      continue;
    }

    try {
      const result = await runNexHealthProxy(resource, new URLSearchParams());
      if ("error" in result) {
        endpoints[resource] = {
          method: "GET",
          path: `/${resource}`,
          query: {
            subdomain: config.subdomain,
            location_id: config.locationId,
          },
          ok: false,
          error: result.error,
        };
        continue;
      }

      const rows = Array.isArray(result.data) ? result.data : [];
      const entry: (typeof endpoints)[string] = {
        method: result.method,
        path: result.upstreamPath,
        query: result.query,
        ok: true,
        count: result.count,
        sample: sampleItems(rows, 3),
      };

      if (resource === "appointments") {
        const rollup = { show: 0, no_show: 0, cancelled: 0, unknown: 0 };
        for (const item of rows) {
          rollup[mapAttendance(item as Parameters<typeof mapAttendance>[0])]++;
        }
        entry.attendanceRollup = rollup;
      }

      endpoints[resource] = entry;
    } catch (e) {
      endpoints[resource] = {
        method: "GET",
        path: `/${resource as NexHealthProxyResource}`,
        query: {
          subdomain: config.subdomain,
          location_id: config.locationId,
        },
        ok: false,
        error: e instanceof Error ? e.message : "Request failed",
      };
    }
  }

  const failed = Object.values(endpoints).filter((e) => !e.ok).length;

  return NextResponse.json(
    {
      ok: health.ok && failed === 0,
      generatedAt: new Date().toISOString(),
      note: "Full upstream samples (first 3 rows per resource).",
      config: {
        baseUrl: config.baseUrl,
        apiVersion: config.apiVersion,
        subdomain: config.subdomain,
        locationId: config.locationId,
      },
      health,
      range,
      endpoints,
      dashboardApis: {
        health: "/api/health/nexhealth",
        overview: "/api/metrics/overview",
        providers: "/api/metrics/providers",
        thisDebug: "/api/debug/nexhealth",
        nexhealthProxy: "/api/nexhealth/{resource}",
        nexhealthSwagger: "/api-docs",
        openapi: "/api/openapi",
      },
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
