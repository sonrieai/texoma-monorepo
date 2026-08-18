/**
 * Export NexHealth API JSON to files for field-mapping / schema review.
 * Output lives under exports/nexhealth/ (gitignored).
 */

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  fetchNexHealthResource,
  getNexHealthConfig,
  healthCheck,
  resolveListMaxPages,
  unwrapNexHealthList,
} from "@/lib/nexhealth/client";

export type NexHealthExportResource =
  | "auth"
  | "locations"
  | "providers"
  | "patients"
  | "appointments"
  | "appointment_types"
  | "procedures"
  | "charges"
  | "payments"
  | "adjustments"
  | "treatment_plans"
  | "guarantor_balances"
  | "claims"
  | "insurance_balances"
  | "insurance_plans";

export const NEXHEALTH_EXPORT_RESOURCES: NexHealthExportResource[] = [
  "auth",
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
];

export type NexHealthExportOptions = {
  /** Output directory (default: exports/nexhealth). Files are overwritten each run. */
  outputDir?: string;
  /** Max pages per list resource */
  maxPages?: number;
};

export type NexHealthExportFileResult = {
  resource: NexHealthExportResource;
  file: string;
  ok: boolean;
  itemCount: number;
  pageCount: number;
  fieldKeys: string[];
  error?: string;
};

export type NexHealthExportResult = {
  ok: boolean;
  outputDir: string;
  config: {
    subdomain: string;
    locationId: number;
    baseUrl: string;
    apiVersion: string;
  } | null;
  files: NexHealthExportFileResult[];
  manifestFile: string;
  fieldKeysFile: string;
};

type ListExportSpec = {
  resource: NexHealthExportResource;
  path: string;
  listKey: string;
  queryBase: Record<string, string | number | boolean>;
  paginate?: boolean;
  perPage?: number;
};

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

function collectFieldKeys(value: unknown, prefix = "", depth = 0): Set<string> {
  const keys = new Set<string>();
  if (value == null || depth > 4) return keys;
  if (Array.isArray(value)) {
    for (const item of value.slice(0, 5)) {
      for (const k of collectFieldKeys(item, prefix, depth + 1)) keys.add(k);
    }
    return keys;
  }
  if (typeof value !== "object") return keys;
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    const path = prefix ? `${prefix}.${k}` : k;
    keys.add(path);
    if (v && typeof v === "object") {
      for (const nested of collectFieldKeys(v, path, depth + 1)) keys.add(nested);
    }
  }
  return keys;
}

async function writeJson(path: string, data: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

async function fetchPaginatedRaw(
  spec: ListExportSpec,
  maxPages: number,
): Promise<{ pages: unknown[]; items: unknown[] }> {
  const pages: unknown[] = [];
  const items: unknown[] = [];
  let endCursor: string | undefined;

  for (let page = 0; page < maxPages; page += 1) {
    const query = {
      ...spec.queryBase,
      per_page: Math.min(spec.perPage ?? 1000, 1000),
      ...(endCursor ? { start_cursor: endCursor } : {}),
    };
    const body = await fetchNexHealthResource<{
      data?: unknown;
      page_info?: { has_next_page?: boolean; end_cursor?: string | null };
    }>(spec.path, query);
    pages.push(body);
    items.push(...unwrapNexHealthList(body.data, spec.listKey));

    const hasNext = Boolean(body.page_info?.has_next_page);
    const nextCursor = body.page_info?.end_cursor || undefined;
    if (!spec.paginate || !hasNext || !nextCursor || items.length === 0) break;
    endCursor = nextCursor;
  }

  return { pages, items };
}

function buildSpecs(): ListExportSpec[] {
  const apptRange = defaultAppointmentRange();
  const procWindow = defaultDateWindow();
  const updatedSince = defaultUpdatedSince();

  return [
    {
      resource: "locations",
      path: "/locations",
      listKey: "locations",
      queryBase: {},
      paginate: false,
    },
    {
      resource: "providers",
      path: "/providers",
      listKey: "providers",
      queryBase: { per_page: 200 },
      paginate: true,
      perPage: 200,
    },
    {
      resource: "appointment_types",
      path: "/appointment_types",
      listKey: "appointment_types",
      queryBase: { per_page: 200 },
      paginate: false,
    },
    {
      resource: "patients",
      path: "/patients",
      listKey: "patients",
      queryBase: { updated_since: updatedSince, sort: "-updated_at" },
      paginate: true,
      perPage: 200,
    },
    {
      resource: "appointments",
      path: "/appointments",
      listKey: "appointments",
      queryBase: {
        start: apptRange.start,
        end: apptRange.end,
        sort: "-updated_at",
      },
      paginate: true,
      perPage: 1000,
    },
    {
      resource: "procedures",
      path: "/procedures",
      listKey: "procedures",
      queryBase: {
        started_after: procWindow.startedAfter,
        started_before: procWindow.startedBefore,
        sort: "-updated_at",
      },
      paginate: true,
      perPage: 1000,
    },
    {
      resource: "charges",
      path: "/charges",
      listKey: "charges",
      queryBase: {
        updated_since: updatedSince,
        sort: "-updated_at",
        include_deleted: false,
      },
      paginate: true,
      perPage: 1000,
    },
    {
      resource: "payments",
      path: "/payments",
      listKey: "payments",
      queryBase: {
        updated_since: updatedSince,
        sort: "-updated_at",
        include_deleted: false,
      },
      paginate: true,
      perPage: 1000,
    },
    {
      resource: "adjustments",
      path: "/adjustments",
      listKey: "adjustments",
      queryBase: {
        updated_since: updatedSince,
        sort: "-updated_at",
        include_deleted: false,
      },
      paginate: true,
      perPage: 1000,
    },
    {
      resource: "treatment_plans",
      path: "/treatment_plans",
      listKey: "treatment_plans",
      queryBase: { updated_since: updatedSince },
      paginate: true,
      perPage: 1000,
    },
    {
      resource: "guarantor_balances",
      path: "/guarantor_balances",
      listKey: "guarantor_balances",
      queryBase: {
        updated_since: updatedSince,
        show_zero_balances: false,
        sort: "-updated_at",
      },
      paginate: true,
      perPage: 1000,
    },
    {
      resource: "claims",
      path: "/claims",
      listKey: "claims",
      queryBase: {
        updated_since: updatedSince,
        sort: "-updated_at",
        include_deleted: false,
      },
      paginate: true,
      perPage: 1000,
    },
    {
      resource: "insurance_balances",
      path: "/insurance_balances",
      listKey: "insurance_balances",
      queryBase: {
        updated_since: updatedSince,
        sort: "-updated_at",
      },
      paginate: true,
      perPage: 1000,
    },
    {
      resource: "insurance_plans",
      path: "/insurance_plans",
      listKey: "insurance_plans",
      queryBase: {
        updated_since: updatedSince,
        sort: "-updated_at",
        include_deleted: false,
      },
      paginate: true,
      perPage: 1000,
    },
  ];
}

export async function exportNexHealthJson(
  options: NexHealthExportOptions = {},
): Promise<NexHealthExportResult> {
  const config = getNexHealthConfig();
  if (!config) {
    throw new Error("NexHealth is not configured — set NEXHEALTH_* in .env.local");
  }

  const maxPages = options.maxPages ?? resolveListMaxPages();
  const outputDir = options.outputDir ?? "exports/nexhealth";
  await mkdir(outputDir, { recursive: true });

  const files: NexHealthExportFileResult[] = [];
  const allFieldKeys: Record<string, string[]> = {};

  // Auth check (token never written)
  const health = await healthCheck();
  const authPayload = {
    resource: "auth",
    fetchedAt: new Date().toISOString(),
    upstreamPath: "/authenticates",
    method: "POST",
    ok: health.ok,
    message: health.message,
    note: "Token is never exported.",
  };
  const authFile = join(outputDir, "auth.json");
  await writeJson(authFile, authPayload);
  files.push({
    resource: "auth",
    file: authFile,
    ok: health.ok,
    itemCount: health.ok ? 1 : 0,
    pageCount: 1,
    fieldKeys: ["ok", "message"],
    error: health.ok ? undefined : health.message,
  });

  if (!health.ok) {
    const manifestFile = join(outputDir, "_manifest.json");
    await writeJson(manifestFile, {
      ok: false,
      outputDir,
      error: health.message,
      files,
    });
    return {
      ok: false,
      outputDir,
      config: {
        subdomain: config.subdomain,
        locationId: config.locationId,
        baseUrl: config.baseUrl,
        apiVersion: config.apiVersion,
      },
      files,
      manifestFile,
      fieldKeysFile: join(outputDir, "_field-keys.json"),
    };
  }

  for (const spec of buildSpecs()) {
    const outFile = join(outputDir, `${spec.resource}.json`);
    try {
      const { pages, items } = await fetchPaginatedRaw(spec, maxPages);
      const fieldKeySet = collectFieldKeys(items);
      const fieldKeys = [...fieldKeySet].sort();
      allFieldKeys[spec.resource] = fieldKeys;

      const payload = {
        resource: spec.resource,
        fetchedAt: new Date().toISOString(),
        upstreamPath: spec.path,
        query: {
          subdomain: config.subdomain,
          location_id: config.locationId,
          ...spec.queryBase,
        },
        ok: true,
        pageCount: pages.length,
        itemCount: items.length,
        fieldKeys,
        pages,
        items,
      };

      await writeJson(outFile, payload);
      files.push({
        resource: spec.resource,
        file: outFile,
        ok: true,
        itemCount: items.length,
        pageCount: pages.length,
        fieldKeys,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Export failed";
      const payload = {
        resource: spec.resource,
        fetchedAt: new Date().toISOString(),
        upstreamPath: spec.path,
        ok: false,
        error: msg,
      };
      await writeJson(outFile, payload);
      files.push({
        resource: spec.resource,
        file: outFile,
        ok: false,
        itemCount: 0,
        pageCount: 0,
        fieldKeys: [],
        error: msg,
      });
    }
  }

  const fieldKeysFile = join(outputDir, "_field-keys.json");
  await writeJson(fieldKeysFile, {
    fetchedAt: new Date().toISOString(),
    resources: allFieldKeys,
  });

  const manifestFile = join(outputDir, "_manifest.json");
  const ok = files.every((f) => f.ok);
  await writeJson(manifestFile, {
    ok,
    fetchedAt: new Date().toISOString(),
    outputDir,
    maxPages,
    config: {
      subdomain: config.subdomain,
      locationId: config.locationId,
      baseUrl: config.baseUrl,
      apiVersion: config.apiVersion,
    },
    files: files.map((f) => ({
      resource: f.resource,
      file: f.file,
      ok: f.ok,
      itemCount: f.itemCount,
      pageCount: f.pageCount,
      fieldKeyCount: f.fieldKeys.length,
      error: f.error,
    })),
    fieldKeysFile,
    note: "Full upstream JSON — do not commit (exports/nexhealth is gitignored).",
  });

  return {
    ok,
    outputDir,
    config: {
      subdomain: config.subdomain,
      locationId: config.locationId,
      baseUrl: config.baseUrl,
      apiVersion: config.apiVersion,
    },
    files,
    manifestFile,
    fieldKeysFile,
  };
}
