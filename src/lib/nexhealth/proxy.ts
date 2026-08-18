import {
  getNexHealthConfig,
  healthCheck,
  listAdjustments,
  listAppointmentTypes,
  listAppointments,
  listCharges,
  listGuarantorBalances,
  listClaims,
  listInsuranceBalances,
  listInsurancePlans,
  listLocations,
  listPatients,
  listPayments,
  listProcedures,
  listProviders,
  listTreatmentPlans,
  type NexTreatmentPlanStatus,
} from "@/lib/nexhealth/client";

export const NEXHEALTH_PROXY_RESOURCES = [
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
  "claims",
  "insurance_balances",
  "insurance_plans",
] as const;

export type NexHealthProxyResource = (typeof NEXHEALTH_PROXY_RESOURCES)[number];

export function isNexHealthProxyResource(
  value: string,
): value is NexHealthProxyResource {
  return (NEXHEALTH_PROXY_RESOURCES as readonly string[]).includes(value);
}

function parseIntParam(value: string | null, fallback: number): number {
  if (!value) return fallback;
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

type NextResponseError = { error: string };

function defaultAppointmentRange() {
  const end = new Date();
  const start = new Date();
  start.setFullYear(start.getFullYear() - 1);
  const fmt = (d: Date) =>
    `${d.toISOString().slice(0, 19).replace("Z", "")}+0000`;
  return { start: fmt(start), end: fmt(end) };
}

function defaultDateWindow() {
  const end = new Date();
  const start = new Date();
  start.setFullYear(start.getFullYear() - 1);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { startedAfter: fmt(start), startedBefore: fmt(end) };
}

function defaultUpdatedSince() {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 1);
  return d.toISOString();
}

export type NexHealthProxyResult = {
  ok: true;
  resource: NexHealthProxyResource;
  method: string;
  upstreamPath: string;
  query: Record<string, string | number | boolean>;
  count: number;
  data: unknown;
  note: string;
};

export async function runNexHealthProxy(
  resource: NexHealthProxyResource,
  searchParams: URLSearchParams,
): Promise<NexHealthProxyResult | NextResponseError> {
  const config = getNexHealthConfig();
  if (!config) {
    return { error: "NexHealth is not configured (check .env.local)." };
  }

  const baseQuery: Record<string, string | number | boolean> = {
    subdomain: config.subdomain,
    location_id: config.locationId,
  };

  const perPage = parseIntParam(searchParams.get("per_page"), 100);
  const maxPages = Math.min(parseIntParam(searchParams.get("max_pages"), 1), 5);

  if (resource === "health") {
    const health = await healthCheck();
    return {
      ok: true,
      resource,
      method: "POST",
      upstreamPath: "/authenticates",
      query: baseQuery,
      count: health.ok ? 1 : 0,
      data: health,
      note: "Auth check only — token is never returned.",
    };
  }

  let data: unknown[] = [];
  let upstreamPath = `/${resource}`;
  const query = { ...baseQuery };

  switch (resource) {
    case "locations": {
      data = await listLocations();
      break;
    }
    case "providers": {
      query.per_page = perPage;
      data = await listProviders(perPage);
      break;
    }
    case "patients": {
      query.per_page = perPage;
      query.sort = "-updated_at";
      const updatedSince = searchParams.get("updated_since") ?? undefined;
      if (updatedSince) query.updated_since = updatedSince;
      data = await listPatients({
        perPage,
        maxPages,
        updatedSince,
      });
      break;
    }
    case "appointments": {
      const range = defaultAppointmentRange();
      const start =
        searchParams.get("start")?.trim() || range.start;
      const end = searchParams.get("end")?.trim() || range.end;
      query.start = start;
      query.end = end;
      query.per_page = Math.min(perPage, 1000);
      query.sort = "-updated_at";
      data = await listAppointments({
        start,
        end,
        perPage: Math.min(perPage, 1000),
        maxPages,
      });
      break;
    }
    case "appointment_types": {
      query.per_page = perPage;
      data = await listAppointmentTypes(perPage);
      break;
    }
    case "procedures": {
      const window = defaultDateWindow();
      const startedAfter =
        searchParams.get("started_after")?.trim() || window.startedAfter;
      const startedBefore =
        searchParams.get("started_before")?.trim() || window.startedBefore;
      query.started_after = startedAfter;
      query.started_before = startedBefore;
      query.sort = "-updated_at";
      query.per_page = Math.min(perPage, 1000);
      data = await listProcedures({
        startedAfter,
        startedBefore,
        perPage: Math.min(perPage, 1000),
        maxPages,
      });
      break;
    }
    case "charges":
    case "payments":
    case "adjustments":
    case "guarantor_balances":
    case "claims":
    case "insurance_balances": {
      const updatedSince =
        searchParams.get("updated_since")?.trim() || defaultUpdatedSince();
      query.updated_since = updatedSince;
      query.sort = "-updated_at";
      query.per_page = Math.min(perPage, 1000);
      if (resource === "guarantor_balances") {
        query.show_zero_balances = false;
      }
      if (
        resource === "charges" ||
        resource === "payments" ||
        resource === "adjustments" ||
        resource === "claims"
      ) {
        query.include_deleted = false;
      }
      if (resource === "charges") {
        data = await listCharges({ updatedSince, perPage, maxPages });
      } else if (resource === "payments") {
        data = await listPayments({ updatedSince, perPage, maxPages });
      } else if (resource === "adjustments") {
        data = await listAdjustments({ updatedSince, perPage, maxPages });
      } else if (resource === "claims") {
        data = await listClaims({ updatedSince, perPage, maxPages });
      } else if (resource === "insurance_balances") {
        data = await listInsuranceBalances({ updatedSince, perPage, maxPages });
      } else {
        data = await listGuarantorBalances({ updatedSince, perPage, maxPages });
      }
      break;
    }
    case "insurance_plans": {
      const updatedSince =
        searchParams.get("updated_since")?.trim() || defaultUpdatedSince();
      query.updated_since = updatedSince;
      query.sort = "-updated_at";
      query.include_deleted = false;
      delete query.location_id;
      data = await listInsurancePlans({ updatedSince, perPage, maxPages });
      break;
    }
    case "treatment_plans": {
      query.per_page = Math.min(perPage, 1000);
      const updatedSince = searchParams.get("updated_since")?.trim();
      const status = searchParams.get("status")?.trim() as
        | NexTreatmentPlanStatus
        | undefined;
      if (updatedSince) query.updated_since = updatedSince;
      if (status) query.status = status;
      data = await listTreatmentPlans({
        updatedSince,
        status,
        perPage,
        maxPages,
      });
      break;
    }
    default:
      return { error: `Unknown resource "${resource}".` };
  }

  return {
    ok: true,
    resource,
    method: "GET",
    upstreamPath,
    query,
    count: data.length,
    data,
    note: "Raw upstream NexHealth rows.",
  };
}

/** Validate required params before proxy (for clearer 400 responses). */
export function validateProxyParams(
  resource: NexHealthProxyResource,
  searchParams: URLSearchParams,
): string | null {
  if (resource === "appointments") {
    const hasStart = Boolean(searchParams.get("start")?.trim());
    const hasEnd = Boolean(searchParams.get("end")?.trim());
    if (hasStart !== hasEnd) {
      return "Provide both start and end, or omit both to use the default 12-month window.";
    }
  }

  if (resource === "procedures") {
    const hasAfter = Boolean(searchParams.get("started_after")?.trim());
    const hasBefore = Boolean(searchParams.get("started_before")?.trim());
    if (hasAfter !== hasBefore) {
      return "Provide both started_after and started_before, or omit both for defaults.";
    }
  }

  const status = searchParams.get("status")?.trim();
  if (resource === "treatment_plans" && status) {
    const allowed = [
      "not_applicable",
      "proposed",
      "accepted",
      "rejected",
      "completed",
    ];
    if (!allowed.includes(status)) {
      return `Invalid status. Allowed: ${allowed.join(", ")}`;
    }
  }

  return null;
}
