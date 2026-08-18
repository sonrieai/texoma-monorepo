import {
  logNexHealth,
  logNexHealthRequest,
  logNexHealthResponse,
} from "@/lib/nexhealth/logger";

export type NexHealthConfig = {
  apiKey: string;
  subdomain: string;
  locationId: number;
  baseUrl: string;
  apiVersion: string;
};

export class NexHealthConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NexHealthConfigError";
  }
}

export type NexPatient = {
  id: number;
  first_name?: string;
  last_name?: string;
  email?: string | null;
  foreign_id?: string | null;
  foreign_id_type?: string | null;
  inactive?: boolean;
  bio?: Record<string, unknown>;
  [key: string]: unknown;
};

export type NexAppointment = {
  id?: number;
  patient_id?: number;
  provider_id?: number;
  provider_name?: string;
  appointment_type_id?: number | null;
  start_time?: string;
  cancelled?: boolean;
  confirmed?: boolean;
  patient_confirmed?: boolean;
  patient_missed?: boolean;
  checked_out?: boolean;
  checkin_at?: string | null;
  [key: string]: unknown;
};

export type NexAppointmentType = {
  id: number;
  name?: string;
  description?: string | null;
  [key: string]: unknown;
};

/** Open Dental / PMS procedure code or EHR appointment type from GET /locations/{id}/appointment_descriptors */
export type NexAppointmentDescriptor = {
  id?: number;
  name?: string | null;
  code?: string | null;
  descriptor_type?: string | null;
  active?: boolean;
  foreign_id?: string | null;
  foreign_id_type?: string | null;
  [key: string]: unknown;
};

export type NexProvider = {
  id: number;
  name?: string;
  first_name?: string;
  last_name?: string;
  [key: string]: unknown;
};

export type NexLocation = {
  id: number;
  name?: string;
  [key: string]: unknown;
};

/** NexHealth Price — amount is dollars as a string (e.g. "62.00"). */
export type NexPrice = {
  amount?: string | null;
  currency?: string | null;
};

export type NexProcedure = {
  id?: number;
  patient_id?: number | null;
  provider_id?: number | null;
  code?: string | null;
  name?: string | null;
  status?: string | null;
  fee?: NexPrice | null;
  start_date?: string | null;
  end_date?: string | null;
  updated_at?: string;
  [key: string]: unknown;
};

export type NexCharge = {
  id?: number;
  provider_id?: number | null;
  patient_id?: number | null;
  procedure_id?: number | null;
  procedure_code?: string | null;
  fee?: NexPrice | null;
  charged_at?: string | null;
  deleted_at?: string | null;
  updated_at?: string;
  [key: string]: unknown;
};

export type NexPayment = {
  id?: number;
  provider_id?: number | null;
  patient_id?: number | null;
  payment_amount?: NexPrice | null;
  paid_at?: string | null;
  deleted_at?: string | null;
  updated_at?: string;
  payment_type?: string | null;
  payment_type_id?: number | null;
  type?: string | null;
  description?: string | null;
  notes?: string | null;
  payment_method?: string | null;
  /** NexHealth v3 list payload */
  claim_id?: number | null;
  insurance_plan_id?: number | null;
  /** Legacy/alternate field name — keep for compatibility */
  insurance_claim_id?: number | null;
  [key: string]: unknown;
};

export type NexFeeSchedule = {
  id: number;
  name?: string | null;
  active?: boolean | null;
  location_id?: number | null;
  updated_at?: string | null;
  [key: string]: unknown;
};

export type NexFeeScheduleProcedure = {
  id?: number;
  code?: string | null;
  fee?: NexPrice | null;
  fee_schedule_id?: number | null;
  location_id?: number | null;
  procedure_code_id?: string | null;
  updated_at?: string | null;
  [key: string]: unknown;
};

export type NexAdjustment = {
  id?: number;
  provider_id?: number | null;
  adjustment_amount?: NexPrice | null;
  adjusted_at?: string | null;
  deleted_at?: string | null;
  updated_at?: string;
  [key: string]: unknown;
};

export type NexTreatmentPlanStatus =
  | "not_applicable"
  | "proposed"
  | "accepted"
  | "rejected"
  | "completed";

export type NexTreatmentPlan = {
  id?: number;
  name?: string | null;
  patient_id?: number | null;
  updated_at?: string;
  status?: NexTreatmentPlanStatus | null;
  procedures?: NexProcedure[];
  [key: string]: unknown;
};

export type NexGuarantorBalance = {
  id?: number;
  guarantor_id?: number | null;
  location_id?: number | null;
  updated_at?: string;
  total_balance?: NexPrice | null;
  total_balance_over_90?: NexPrice | null;
  total_balance_61_90?: NexPrice | null;
  total_balance_31_60?: NexPrice | null;
  total_balance_under_30?: NexPrice | null;
  guarantor_portion?: NexPrice | null;
  insurance_estimate?: NexPrice | null;
  write_off_estimate?: NexPrice | null;
  [key: string]: unknown;
};

/** NexHealth GET /claims status. Sandbox/OD sync also emits `paid` (not only `received`). */
export type NexClaimStatus =
  | "draft"
  | "sent"
  | "received"
  | "paid"
  | "canceled";

export type NexClaimTotals = {
  amount_billed_to_insurance?: NexPrice | null;
  estimated_insurance_payment?: NexPrice | null;
  insurance_payment?: NexPrice | null;
  write_off?: NexPrice | null;
};

/** GET /claims — Open Dental via Synchronizer (v20240412 / v3.0.0). */
export type NexClaim = {
  id?: number;
  location_id?: number | null;
  patient_id?: number | null;
  provider_id?: number | null;
  guarantor_id?: number | null;
  status?: NexClaimStatus | string | null;
  received_at?: string | null;
  sent_at?: string | null;
  note?: string | null;
  primary_insurance_plan_id?: number | null;
  secondary_insurance_plan_id?: number | null;
  date_of_service?: string | null;
  totals?: NexClaimTotals | null;
  updated_at?: string;
  deleted_at?: string | null;
  [key: string]: unknown;
};

/** GET /insurance_balances — insurance-only AR aging (Open Dental supported). */
export type NexInsuranceBalance = {
  id?: number;
  patient_id?: number | null;
  guarantor_id?: number | null;
  location_id?: number | null;
  updated_at?: string;
  estimated_amount_under_30?: NexPrice | null;
  estimated_amount_31_60?: NexPrice | null;
  estimated_amount_61_90?: NexPrice | null;
  estimated_amount_over_90?: NexPrice | null;
  billed_amount_under_30?: NexPrice | null;
  billed_amount_31_60?: NexPrice | null;
  billed_amount_61_90?: NexPrice | null;
  billed_amount_over_90?: NexPrice | null;
  [key: string]: unknown;
};

/** GET /insurance_plans — payer names for claim/payment plan ids. */
export type NexInsurancePlan = {
  id?: number;
  name?: string | null;
  payer_id?: string | null;
  group_num?: string | null;
  updated_at?: string;
  deleted_at?: string | null;
  [key: string]: unknown;
};

/** Parse Price.amount (dollars string) to integer cents. */
export function nexPriceToCents(price: NexPrice | null | undefined): number {
  if (!price?.amount) return 0;
  const n = Number.parseFloat(price.amount);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

let cachedToken: { token: string; expiresAt: number } | null = null;

/** Hard cap to avoid runaway NexHealth pagination loops. */
export const NEXHEALTH_MAX_PAGES_CAP = 200;

/**
 * Pages to fetch when paginating list endpoints.
 * Sync job: set SYNC_NEXHEALTH_MAX_PAGES (default 50; use `all` or `0` for cap).
 */
export function resolveListMaxPages(override?: number): number {
  if (override != null && override > 0) {
    return Math.min(override, NEXHEALTH_MAX_PAGES_CAP);
  }
  const raw = process.env.SYNC_NEXHEALTH_MAX_PAGES?.trim();
  if (raw === "0" || raw?.toLowerCase() === "all") {
    return NEXHEALTH_MAX_PAGES_CAP;
  }
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
  const fallback = 50;
  const n = Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  return Math.min(n, NEXHEALTH_MAX_PAGES_CAP);
}

export function getNexHealthConfig(): NexHealthConfig | null {
  const apiKey = process.env.NEXHEALTH_API_KEY?.trim();
  if (!apiKey) return null;

  const subdomain = process.env.NEXHEALTH_SUBDOMAIN?.trim();
  const locationRaw = process.env.NEXHEALTH_LOCATION_ID?.trim();
  const locationId = locationRaw ? Number.parseInt(locationRaw, 10) : Number.NaN;

  if (!subdomain || !Number.isFinite(locationId) || locationId <= 0) {
    return null;
  }

  return {
    apiKey,
    subdomain,
    locationId,
    baseUrl: (
      process.env.NEXHEALTH_BASE_URL || "https://nexhealth.info"
    ).replace(/\/$/, ""),
    apiVersion: process.env.NEXHEALTH_API_VERSION || "v3.0.0",
  };
}

/** Require full NexHealth env — no sandbox defaults. */
export function requireNexHealthConfig(): NexHealthConfig {
  const apiKey = process.env.NEXHEALTH_API_KEY?.trim();
  if (!apiKey) {
    throw new NexHealthConfigError(
      "NEXHEALTH_API_KEY is required. Set it in .env.local — the dashboard does not use mock or demo data.",
    );
  }

  const subdomain = process.env.NEXHEALTH_SUBDOMAIN?.trim();
  if (!subdomain) {
    throw new NexHealthConfigError(
      "NEXHEALTH_SUBDOMAIN is required (your NexHealth institution subdomain from the Open Dental sync — not a demo default).",
    );
  }

  const locationRaw = process.env.NEXHEALTH_LOCATION_ID?.trim();
  const locationId = locationRaw ? Number.parseInt(locationRaw, 10) : Number.NaN;
  if (!locationRaw || !Number.isFinite(locationId) || locationId <= 0) {
    throw new NexHealthConfigError(
      "NEXHEALTH_LOCATION_ID is required (numeric location id from your NexHealth sync).",
    );
  }

  return {
    apiKey,
    subdomain,
    locationId,
    baseUrl: (
      process.env.NEXHEALTH_BASE_URL || "https://nexhealth.info"
    ).replace(/\/$/, ""),
    apiVersion: process.env.NEXHEALTH_API_VERSION || "v3.0.0",
  };
}

export function isNexHealthConfigured(): boolean {
  return getNexHealthConfig() !== null;
}

export function nexHealthConfigStatus(): {
  configured: boolean;
  missing: string[];
} {
  const missing: string[] = [];
  if (!process.env.NEXHEALTH_API_KEY?.trim()) missing.push("NEXHEALTH_API_KEY");
  if (!process.env.NEXHEALTH_SUBDOMAIN?.trim()) missing.push("NEXHEALTH_SUBDOMAIN");
  if (!process.env.NEXHEALTH_LOCATION_ID?.trim()) {
    missing.push("NEXHEALTH_LOCATION_ID");
  } else {
    const id = Number.parseInt(process.env.NEXHEALTH_LOCATION_ID.trim(), 10);
    if (!Number.isFinite(id) || id <= 0) missing.push("NEXHEALTH_LOCATION_ID (invalid)");
  }
  return { configured: missing.length === 0, missing };
}

async function authenticate(config: NexHealthConfig): Promise<string> {
  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt > now + 60_000) {
    logNexHealth("auth_cache_hit", { subdomain: config.subdomain });
    return cachedToken.token;
  }

  const path = "/authenticates";
  const method = "POST";
  logNexHealthRequest({ method, path });
  const started = Date.now();

  const res = await fetch(`${config.baseUrl}/authenticates`, {
    method: "POST",
    headers: {
      Authorization: config.apiKey,
      "Nex-Api-Version": config.apiVersion,
      Accept: "application/vnd.Nexhealth+json",
    },
    cache: "no-store",
  });

  if (!res.ok) {
    logNexHealthResponse({
      method,
      path,
      status: res.status,
      ms: Date.now() - started,
      error: `auth failed (${res.status})`,
    });
    throw new Error(`NexHealth auth failed (${res.status})`);
  }

  const body = (await res.json()) as {
    data?: { token?: string };
    code?: boolean;
  };
  const token = body.data?.token;
  if (!token) {
    logNexHealthResponse({
      method,
      path,
      status: res.status,
      ms: Date.now() - started,
      error: "missing token",
    });
    throw new Error("NexHealth auth response missing token");
  }

  // Sandbox ~24h; production ~1h — cache conservatively for 50 minutes
  cachedToken = { token, expiresAt: now + 50 * 60_000 };
  logNexHealthResponse({
    method,
    path,
    status: res.status,
    ms: Date.now() - started,
    body: { data: { token: "[redacted]" }, code: body.code },
  });
  return token;
}

type QueryValue = string | number | boolean | Array<string | number> | undefined;
type Query = Record<string, QueryValue>;

async function nexFetch<T>(
  path: string,
  query: Query = {},
  init?: RequestInit,
): Promise<T> {
  const config = getNexHealthConfig();
  if (!config) throw new Error("NexHealth is not configured");

  const token = await authenticate(config);
  const url = new URL(`${config.baseUrl}${path}`);
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === "") continue;
    if (Array.isArray(value)) {
      for (const item of value) {
        url.searchParams.append(key, String(item));
      }
      continue;
    }
    url.searchParams.set(key, String(value));
  }

  const method = (init?.method || "GET").toUpperCase();
  logNexHealthRequest({
    method,
    path,
    query: query as never,
  });
  const started = Date.now();

  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Nex-Api-Version": config.apiVersion,
      Accept: "application/vnd.Nexhealth+json",
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    logNexHealthResponse({
      method,
      path,
      status: res.status,
      ms: Date.now() - started,
      error: text.slice(0, 200) || `HTTP ${res.status}`,
    });
    throw new Error(
      `NexHealth ${path} failed (${res.status})${text ? `: ${text.slice(0, 200)}` : ""}`,
    );
  }

  const body = (await res.json()) as T;
  logNexHealthResponse({
    method,
    path,
    status: res.status,
    ms: Date.now() - started,
    body,
  });
  return body;
}

function withLocation(query: Query = {}): Query {
  const config = getNexHealthConfig()!;
  return {
    subdomain: config.subdomain,
    location_id: config.locationId,
    ...query,
  };
}

function withSubdomain(query: Query = {}): Query {
  const config = getNexHealthConfig()!;
  return {
    subdomain: config.subdomain,
    ...query,
  };
}

export async function listLocations(): Promise<NexLocation[]> {
  const body = await nexFetch<{ data?: unknown }>(
    "/locations",
    withLocation({}),
  );
  return unwrapList<NexLocation>(body.data, "locations");
}

export async function listProviders(perPage = 50): Promise<NexProvider[]> {
  const body = await nexFetch<{ data?: unknown }>(
    "/providers",
    withLocation({ per_page: perPage }),
  );
  return unwrapList<NexProvider>(body.data, "providers");
}

export async function listPatients(params: {
  perPage?: number;
  newPatient?: boolean;
  updatedSince?: string;
  /** Follow page_info cursors until exhausted or maxPages */
  maxPages?: number;
} = {}): Promise<NexPatient[]> {
  return listCursorPages<NexPatient>(
    "/patients",
    "patients",
    withLocation({
      new_patient: params.newPatient,
      updated_since: params.updatedSince,
      sort: "-updated_at",
    }),
    params.maxPages ?? 5,
    params.perPage ?? 200,
  );
}

export async function listAppointments(params: {
  start: string;
  end: string;
  cancelled?: boolean;
  perPage?: number;
  /** NexHealth query: provider_ids[] — see GET /appointments docs */
  providerIds?: number[];
  timezone?: string;
  /** Follow page_info cursors until exhausted or maxPages */
  maxPages?: number;
}): Promise<NexAppointment[]> {
  const perPage = Math.min(params.perPage ?? 1000, 1000);
  const maxPages = params.maxPages ?? 5;
  const timezone =
    params.timezone ||
    process.env.NEXHEALTH_TIMEZONE?.trim() ||
    undefined;

  const all: NexAppointment[] = [];
  let page = 0;
  let endCursor: string | undefined;

  while (page < maxPages) {
    const body = await nexFetch<{
      data?: unknown;
      page_info?: {
        has_next_page?: boolean;
        end_cursor?: string | null;
      };
    }>(
      "/appointments",
      withLocation({
        start: params.start,
        end: params.end,
        // Docs: sort (not "sorted"); leading dash = descending
        sort: "-updated_at",
        cancelled: params.cancelled,
        per_page: perPage,
        timezone,
        ...(params.providerIds?.length
          ? { "provider_ids[]": params.providerIds }
          : {}),
        ...(endCursor ? { start_cursor: endCursor } : {}),
      }),
    );

    const batch = unwrapList<NexAppointment>(body.data, "appointments");
    all.push(...batch);

    const hasNext = Boolean(body.page_info?.has_next_page);
    const nextCursor = body.page_info?.end_cursor || undefined;
    if (!hasNext || !nextCursor || batch.length === 0) break;
    endCursor = nextCursor;
    page += 1;
  }

  return all;
}

export async function listAppointmentTypes(
  perPage = 100,
): Promise<NexAppointmentType[]> {
  const body = await nexFetch<{ data?: unknown }>(
    "/appointment_types",
    withLocation({ per_page: perPage }),
  );
  return unwrapList<NexAppointmentType>(body.data, "appointment_types");
}

const APPOINTMENT_DESCRIPTOR_PROCEDURE_TYPE = "Procedure Codes";

/**
 * GET /locations/{id}/appointment_descriptors — full PMS procedure code master list.
 * @see https://docs.nexhealth.com/reference/getlocationsidappointmentdescriptors
 */
export async function listAppointmentDescriptors(params?: {
  descriptorType?: string;
  perPage?: number;
  maxPages?: number;
}): Promise<NexAppointmentDescriptor[]> {
  const config = getNexHealthConfig();
  if (!config) {
    throw new NexHealthConfigError("NexHealth is not configured.");
  }

  return listCursorPages<NexAppointmentDescriptor>(
    `/locations/${config.locationId}/appointment_descriptors`,
    "appointment_descriptors",
    {
      subdomain: config.subdomain,
      ...(params?.descriptorType
        ? { descriptor_type: params.descriptorType }
        : {}),
    },
    params?.maxPages ?? 5,
    params?.perPage ?? 1000,
  );
}

/** Active Open Dental procedure codes synced into NexHealth (excludes ~BAD~ placeholders). */
export async function listProcedureCodeDescriptors(): Promise<NexAppointmentDescriptor[]> {
  const rows = await listAppointmentDescriptors({
    descriptorType: APPOINTMENT_DESCRIPTOR_PROCEDURE_TYPE,
    maxPages: 10,
    perPage: 1000,
  });
  return rows.filter(
    (row) =>
      row.active !== false &&
      Boolean(row.code?.trim()) &&
      row.code!.trim() !== "~BAD~",
  );
}

/** Resolve type id from appointment — never reads patient embeds. */
export function appointmentTypeId(appt: NexAppointment): number | null {
  if (typeof appt.appointment_type_id === "number") {
    return appt.appointment_type_id;
  }
  const nested = appt.appointment_type;
  if (nested && typeof nested === "object") {
    const id = (nested as { id?: unknown }).id;
    if (typeof id === "number") return id;
  }
  return null;
}

type CursorPageInfo = {
  has_next_page?: boolean;
  end_cursor?: string | null;
};

/** Cursor-paginate a NexHealth list endpoint (max 1000 per page). */
async function listCursorPages<T>(
  path: string,
  listKey: string,
  queryBase: Query,
  maxPages = 5,
  perPage = 1000,
): Promise<T[]> {
  const all: T[] = [];
  let page = 0;
  let endCursor: string | undefined;

  while (page < maxPages) {
    const body = await nexFetch<{
      data?: unknown;
      page_info?: CursorPageInfo;
    }>(
      path,
      {
        ...queryBase,
        per_page: Math.min(perPage, 1000),
        ...(endCursor ? { start_cursor: endCursor } : {}),
      },
    );

    const batch = unwrapList<T>(body.data, listKey);
    all.push(...batch);

    const hasNext = Boolean(body.page_info?.has_next_page);
    const nextCursor = body.page_info?.end_cursor || undefined;
    if (!hasNext || !nextCursor || batch.length === 0) break;
    endCursor = nextCursor;
    page += 1;
  }

  return all;
}

/**
 * GET /procedures — requires a non-location filter.
 * Use started_after/started_before (YYYY-MM-DD) for date windows.
 * @see https://docs.nexhealth.com/reference/getprocedures
 */
export async function listProcedures(params: {
  startedAfter: string;
  startedBefore: string;
  providerId?: number;
  perPage?: number;
  maxPages?: number;
}): Promise<NexProcedure[]> {
  return listCursorPages<NexProcedure>(
    "/procedures",
    "procedures",
    withLocation({
      started_after: params.startedAfter,
      started_before: params.startedBefore,
      provider_id: params.providerId,
      sort: "-updated_at",
    }),
    params.maxPages ?? 5,
    params.perPage ?? 1000,
  );
}

/**
 * GET /charges — requires patient_id | provider_id | procedure_id | guarantor_id | updated_since.
 * @see https://docs.nexhealth.com/reference/getcharges
 */
export async function listCharges(params: {
  updatedSince: string;
  providerId?: number;
  perPage?: number;
  maxPages?: number;
}): Promise<NexCharge[]> {
  return listCursorPages<NexCharge>(
    "/charges",
    "charges",
    withLocation({
      updated_since: params.updatedSince,
      provider_id: params.providerId,
      sort: "-updated_at",
      include_deleted: false,
    }),
    params.maxPages ?? 5,
    params.perPage ?? 1000,
  );
}

/**
 * GET /payments — at least one filter required (use updated_since for practice window).
 * @see https://docs.nexhealth.com/reference/getpayments
 */
export async function listPayments(params: {
  updatedSince: string;
  providerId?: number;
  perPage?: number;
  maxPages?: number;
}): Promise<NexPayment[]> {
  return listCursorPages<NexPayment>(
    "/payments",
    "payments",
    withLocation({
      updated_since: params.updatedSince,
      provider_id: params.providerId,
      sort: "-updated_at",
      include_deleted: false,
    }),
    params.maxPages ?? 5,
    params.perPage ?? 1000,
  );
}

/**
 * GET /adjustments — at least one filter required (use updated_since).
 * @see https://docs.nexhealth.com/reference/getadjustments
 */
export async function listAdjustments(params: {
  updatedSince: string;
  providerId?: number;
  perPage?: number;
  maxPages?: number;
}): Promise<NexAdjustment[]> {
  return listCursorPages<NexAdjustment>(
    "/adjustments",
    "adjustments",
    withLocation({
      updated_since: params.updatedSince,
      provider_id: params.providerId,
      sort: "-updated_at",
      include_deleted: false,
    }),
    params.maxPages ?? 5,
    params.perPage ?? 1000,
  );
}

/**
 * GET /treatment_plans — Open Dental, Dentrix, Eaglesoft.
 * Filter by patient_id, status, updated_since (cursor pagination).
 * @see https://docs.nexhealth.com/reference/gettreatmentplans
 */
export async function listTreatmentPlans(params: {
  updatedSince?: string;
  status?: NexTreatmentPlanStatus;
  patientId?: number;
  perPage?: number;
  maxPages?: number;
} = {}): Promise<NexTreatmentPlan[]> {
  return listCursorPages<NexTreatmentPlan>(
    "/treatment_plans",
    "treatment_plans",
    withLocation({
      updated_since: params.updatedSince,
      status: params.status,
      patient_id: params.patientId,
    }),
    params.maxPages ?? 5,
    params.perPage ?? 1000,
  );
}

/**
 * GET /guarantor_balances — Open Dental, Dentrix, Eaglesoft.
 * Requires guarantor_id or updated_since. Returns AR aging buckets.
 * @see https://docs.nexhealth.com/reference/getguarantorbalances
 */
export async function listGuarantorBalances(params: {
  updatedSince: string;
  guarantorId?: number;
  showZeroBalances?: boolean;
  perPage?: number;
  maxPages?: number;
}): Promise<NexGuarantorBalance[]> {
  return listCursorPages<NexGuarantorBalance>(
    "/guarantor_balances",
    "guarantor_balances",
    withLocation({
      updated_since: params.updatedSince,
      guarantor_id: params.guarantorId,
      show_zero_balances: params.showZeroBalances ?? false,
      sort: "-updated_at",
    }),
    params.maxPages ?? 5,
    params.perPage ?? 1000,
  );
}

/**
 * GET /claims — requires patient_id | guarantor_id | provider_id | updated_since | date_of_service.
 * Status: draft | sent | received | paid | canceled. Open Dental via Synchronizer.
 * @see https://docs.nexhealth.com/reference/getclaims
 */
export async function listClaims(params: {
  updatedSince: string;
  perPage?: number;
  maxPages?: number;
}): Promise<NexClaim[]> {
  return listCursorPages<NexClaim>(
    "/claims",
    "claims",
    withLocation({
      updated_since: params.updatedSince,
      sort: "-updated_at",
      include_deleted: false,
    }),
    params.maxPages ?? 5,
    params.perPage ?? 1000,
  );
}

/**
 * GET /insurance_balances — insurance AR aging (Open Dental, Dentrix, Eaglesoft).
 * Requires patient_id | guarantor_id | updated_since.
 * @see https://docs.nexhealth.com/reference/getinsurancebalances
 */
export async function listInsuranceBalances(params: {
  updatedSince: string;
  perPage?: number;
  maxPages?: number;
}): Promise<NexInsuranceBalance[]> {
  return listCursorPages<NexInsuranceBalance>(
    "/insurance_balances",
    "insurance_balances",
    withLocation({
      updated_since: params.updatedSince,
      sort: "-updated_at",
    }),
    params.maxPages ?? 5,
    params.perPage ?? 1000,
  );
}

/**
 * GET /insurance_plans — institution-level (no location_id).
 * @see https://docs.nexhealth.com/reference/getinsuranceplans
 */
export async function listInsurancePlans(params?: {
  updatedSince?: string;
  perPage?: number;
  maxPages?: number;
}): Promise<NexInsurancePlan[]> {
  return listCursorPages<NexInsurancePlan>(
    "/insurance_plans",
    "insurance_plans",
    withSubdomain({
      updated_since: params?.updatedSince,
      sort: "-updated_at",
      include_deleted: false,
    }),
    params?.maxPages ?? 5,
    params?.perPage ?? 1000,
  );
}

/**
 * GET /fee_schedules — Open Dental fee schedule names (Office Fees, insurance, etc.).
 * @see https://docs.nexhealth.com/reference/getfeeschedules
 */
export async function listFeeSchedules(params?: {
  updatedSince?: string;
  active?: boolean;
  perPage?: number;
  maxPages?: number;
}): Promise<NexFeeSchedule[]> {
  return listCursorPages<NexFeeSchedule>(
    "/fee_schedules",
    "fee_schedules",
    withLocation({
      updated_since: params?.updatedSince,
      active: params?.active ?? true,
    }),
    params?.maxPages ?? 5,
    params?.perPage ?? 200,
  );
}

/**
 * GET /fee_schedule_procedures — per-code fees for each fee schedule.
 * Requires fee_schedule_id or updated_since.
 * @see https://docs.nexhealth.com/reference/getfeescheduleprocedures
 */
export async function listFeeScheduleProcedures(params: {
  updatedSince?: string;
  feeScheduleId?: number;
  perPage?: number;
  maxPages?: number;
}): Promise<NexFeeScheduleProcedure[]> {
  if (!params.updatedSince && params.feeScheduleId == null) {
    throw new Error(
      "listFeeScheduleProcedures requires updated_since or fee_schedule_id",
    );
  }

  return listCursorPages<NexFeeScheduleProcedure>(
    "/fee_schedule_procedures",
    "fee_schedule_procedures",
    withLocation({
      updated_since: params.updatedSince,
      fee_schedule_id: params.feeScheduleId,
    }),
    params?.maxPages ?? 20,
    params?.perPage ?? 1000,
  );
}

export async function createAppointment(appt: {
  patient_id: number;
  provider_id: number;
  start_time: string;
  operatory_id?: number;
  appointment_type_id?: number;
  note?: string;
}): Promise<unknown> {
  return nexFetch(
    "/appointments",
    withLocation({ notify_patient: false }),
    {
      method: "POST",
      body: JSON.stringify({ appt }),
    },
  );
}

export async function healthCheck(): Promise<{
  ok: boolean;
  configured: boolean;
  message: string;
  locationId?: number;
  subdomain?: string;
}> {
  const config = getNexHealthConfig();
  if (!config) {
    const { missing } = nexHealthConfigStatus();
    return {
      ok: false,
      configured: false,
      message: `NexHealth not configured — set ${missing.join(", ")} in .env.local (no mock data).`,
    };
  }

  try {
    await authenticate(config);
    return {
      ok: true,
      configured: true,
      message: "Authenticated",
      locationId: config.locationId,
      subdomain: config.subdomain,
    };
  } catch (err) {
    return {
      ok: false,
      configured: true,
      message: err instanceof Error ? err.message : "Auth failed",
      locationId: config.locationId,
      subdomain: config.subdomain,
    };
  }
}

/**
 * Map NexHealth appointment flags to show / no-show / cancelled / unknown.
 * Exact field names are a discovery item — see docs/DATA_ACCESS.md.
 */
export function mapAttendance(
  appt: NexAppointment,
): "show" | "no_show" | "cancelled" | "unknown" {
  if (appt.cancelled) return "cancelled";
  if (appt.patient_missed === true) return "no_show";
  // Prefer explicit clinical presence signals when Synchronizer populates them
  if (appt.checkin_at || appt.checked_out === true) return "show";
  if (appt.confirmed === true || appt.patient_confirmed === true) return "show";
  return "unknown";
}

export function providerDisplayName(p: NexProvider): string {
  if (p.name) return p.name;
  const full = [p.first_name, p.last_name].filter(Boolean).join(" ");
  return full || `Provider ${p.id}`;
}

/** Raw NexHealth GET (includes `data`, `page_info`, etc.). For export / schema review only. */
export async function fetchNexHealthResource<T = unknown>(
  path: string,
  query: Query = {},
): Promise<T> {
  return nexFetch<T>(path, withLocation(query));
}

export function unwrapNexHealthList<T>(data: unknown, key: string): T[] {
  return unwrapList<T>(data, key);
}

function unwrapList<T>(data: unknown, key: string): T[] {
  if (Array.isArray(data)) return data as T[];
  if (data && typeof data === "object") {
    const record = data as Record<string, unknown>;
    if (Array.isArray(record[key])) return record[key] as T[];
    if (Array.isArray(record.data)) return record.data as T[];
  }
  return [];
}
