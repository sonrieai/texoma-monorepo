import { NEXHEALTH_PROXY_RESOURCES } from "@/lib/nexhealth/proxy";

type OasParam = {
  name: string;
  in: "query";
  required?: boolean;
  description?: string;
  example?: string;
  schema: Record<string, unknown>;
};

const PER_PAGE_PARAM: OasParam = {
  name: "per_page",
  in: "query",
  schema: { type: "integer", minimum: 1, maximum: 1000, default: 100 },
  description: "Page size (NexHealth max 1000).",
};

const MAX_PAGES_PARAM: OasParam = {
  name: "max_pages",
  in: "query",
  schema: { type: "integer", minimum: 1, maximum: 5, default: 1 },
  description: "Cursor pages to follow (max 5).",
};

const STANDARD_RESPONSES = {
  "200": {
    description: "NexHealth upstream response (raw JSON)",
    content: {
      "application/json": {
        schema: { $ref: "#/components/schemas/NexHealthProxyResponse" },
      },
    },
  },
  "400": { $ref: "#/components/responses/BadRequest" },
  "403": { $ref: "#/components/responses/DebugDisabled" },
  "502": { $ref: "#/components/responses/UpstreamError" },
  "503": { $ref: "#/components/responses/ServiceUnavailable" },
};

function listOperation(
  resource: string,
  upstreamPath: string,
  parameters: OasParam[],
) {
  return {
    get: {
      tags: ["NexHealth"],
      summary: upstreamPath,
      description:
        `Proxies NexHealth \`${upstreamPath}\` (Open Dental via Synchronizer). ` +
        "Credentials come from server env (`NEXHEALTH_*`). Requires `NEXHEALTH_DEBUG=1` in production.",
      operationId: `nexhealth_${resource.replace(/[^a-z0-9]/gi, "_")}`,
      parameters,
      responses: STANDARD_RESPONSES,
    },
  };
}

const UPSTREAM_PATH: Record<(typeof NEXHEALTH_PROXY_RESOURCES)[number], string> = {
  health: "POST /authenticates",
  locations: "GET /locations",
  providers: "GET /providers",
  patients: "GET /patients",
  appointments: "GET /appointments",
  appointment_types: "GET /appointment_types",
  procedures: "GET /procedures",
  charges: "GET /charges",
  payments: "GET /payments",
  adjustments: "GET /adjustments",
  treatment_plans: "GET /treatment_plans",
  guarantor_balances: "GET /guarantor_balances",
};

function buildResourcePath(resource: Exclude<(typeof NEXHEALTH_PROXY_RESOURCES)[number], "health">) {
  const upstream = UPSTREAM_PATH[resource];
  const baseParams = [PER_PAGE_PARAM, MAX_PAGES_PARAM];

  switch (resource) {
    case "appointments":
      return listOperation(resource, upstream, [
        ...baseParams,
        {
          name: "start",
          in: "query",
          schema: { type: "string" },
          description: "ISO8601 start. Default: 12 months ago.",
          example: "2025-08-15T00:00:00+0000",
        },
        {
          name: "end",
          in: "query",
          schema: { type: "string" },
          description: "ISO8601 end. Default: now.",
          example: "2026-08-15T23:59:59+0000",
        },
      ]);
    case "procedures":
      return listOperation(resource, upstream, [
        ...baseParams,
        {
          name: "started_after",
          in: "query",
          schema: { type: "string", format: "date" },
          description: "YYYY-MM-DD. Default: 12 months ago.",
        },
        {
          name: "started_before",
          in: "query",
          schema: { type: "string", format: "date" },
          description: "YYYY-MM-DD. Default: today.",
        },
      ]);
    case "patients":
    case "charges":
    case "payments":
    case "adjustments":
    case "guarantor_balances":
    case "treatment_plans":
      return listOperation(resource, upstream, [
        ...baseParams,
        {
          name: "updated_since",
          in: "query",
          schema: { type: "string", format: "date-time" },
          description: "ISO8601 filter. Default: 12 months ago where applicable.",
        },
        ...(resource === "treatment_plans"
          ? [
              {
                name: "status",
                in: "query" as const,
                schema: {
                  type: "string",
                  enum: [
                    "not_applicable",
                    "proposed",
                    "accepted",
                    "rejected",
                    "completed",
                  ],
                },
              } satisfies OasParam,
            ]
          : []),
      ]);
    default:
      return listOperation(resource, upstream, baseParams);
  }
}

export function buildOpenApiSpec(baseUrl: string) {
  const listResources = NEXHEALTH_PROXY_RESOURCES.filter((r) => r !== "health");
  const paths: Record<string, unknown> = {
    "/api/nexhealth/health": {
      get: {
        tags: ["NexHealth"],
        summary: "POST /authenticates",
        description:
          "Auth check against NexHealth. Returns configured location/subdomain status — token is never exposed.",
        operationId: "nexhealth_health",
        responses: STANDARD_RESPONSES,
      },
    },
    ...Object.fromEntries(
      listResources.map((resource) => [
        `/api/nexhealth/${resource}`,
        buildResourcePath(resource),
      ]),
    ),
  };

  return {
    openapi: "3.0.3",
    info: {
      title: "NexHealth API (Open Dental)",
      version: "1.0.0",
      description:
        "Inspect NexHealth upstream responses used by the Texoma sync job. " +
        "Each operation proxies a NexHealth endpoint. " +
        "Set NEXHEALTH_DEBUG=1 in .env.local to enable Try it out.",
      externalDocs: {
        description: "NexHealth API reference",
        url: "https://docs.nexhealth.com/reference",
      },
    },
    servers: [{ url: baseUrl, description: "Local proxy (forwards to nexhealth.info)" }],
    tags: [
      {
        name: "NexHealth",
        description:
          "Open Dental data via NexHealth Synchronizer. Raw upstream JSON.",
      },
    ],
    paths,
    components: {
      responses: {
        BadRequest: {
          description: "Invalid query parameters",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ErrorBody" },
            },
          },
        },
        DebugDisabled: {
          description: "Set NEXHEALTH_DEBUG=1 to enable Try it out.",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ErrorBody" },
            },
          },
        },
        ServiceUnavailable: {
          description: "NexHealth env not configured",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ErrorBody" },
            },
          },
        },
        UpstreamError: {
          description: "NexHealth upstream request failed",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ErrorBody" },
            },
          },
        },
      },
      schemas: {
        ErrorBody: {
          type: "object",
          properties: {
            ok: { type: "boolean" },
            error: { type: "string" },
          },
        },
        NexHealthProxyResponse: {
          type: "object",
          properties: {
            ok: { type: "boolean", example: true },
            resource: { type: "string", example: "providers" },
            method: { type: "string", example: "GET" },
            upstreamPath: { type: "string", example: "/providers" },
            query: {
              type: "object",
              additionalProperties: { type: "string" },
              description: "Query sent to NexHealth (subdomain + location_id included).",
            },
            count: { type: "integer", example: 4 },
            data: {
              type: "object",
              description: "NexHealth payload (array or object). Raw upstream JSON.",
              additionalProperties: true,
            },
            note: { type: "string" },
          },
        },
      },
    },
  };
}
