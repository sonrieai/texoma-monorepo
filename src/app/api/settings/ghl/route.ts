import { NextResponse } from "next/server";
import { requireDashboardSession } from "@/lib/auth/require-dashboard-session";
import {
  getGhlConfig,
  isGhlConfiguredFromEnv,
  resolveGhlConfigSource,
} from "@/lib/ghl/config";
import { testGhlConnection } from "@/lib/ghl/test-connection";
import type { GhlConfig } from "@/lib/ghl/types";
import { isMongoConfigured } from "@/lib/mongo/client";
import {
  decryptGhlApiKey,
  deleteGhlIntegrationDoc,
  defaultGhlBaseUrl,
  encryptSecret,
  getGhlIntegrationDoc,
  maskApiKey,
  upsertGhlIntegrationDoc,
} from "@/lib/mongo/integration-settings";

export const dynamic = "force-dynamic";

function unauthorized() {
  return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
}

function normalizeBaseUrl(raw: unknown): string {
  if (typeof raw !== "string" || !raw.trim()) return defaultGhlBaseUrl();
  return raw.trim().replace(/\/$/, "");
}

async function buildStatusPayload() {
  const source = await resolveGhlConfigSource();
  const mongoDoc = await getGhlIntegrationDoc();
  const envConfigured = isGhlConfiguredFromEnv();

  let locationId: string | null = null;
  let locationName: string | null = null;
  let apiKeyMasked: string | null = null;
  let pipelineCount: number | null = null;

  if (source === "mongo" && mongoDoc) {
    locationId = mongoDoc.locationId;
    locationName = mongoDoc.locationName ?? null;
    pipelineCount = mongoDoc.pipelineCount ?? null;
    try {
      const apiKey = await decryptGhlApiKey(mongoDoc);
      apiKeyMasked = maskApiKey(apiKey);
    } catch {
      apiKeyMasked = "••••";
    }
  } else if (source === "env") {
    const envKey = process.env.GHL_API_KEY?.trim();
    locationId = process.env.GHL_LOCATION_ID?.trim() ?? null;
    apiKeyMasked = envKey ? maskApiKey(envKey) : null;
  }

  return {
    ok: true,
    configured: source != null,
    source,
    mongoConfigured: isMongoConfigured(),
    envConfigured,
    locationId,
    locationName,
    apiKeyMasked,
    baseUrl:
      mongoDoc?.baseUrl ??
      process.env.GHL_BASE_URL?.trim().replace(/\/$/, "") ??
      defaultGhlBaseUrl(),
    sourceCustomFieldId:
      mongoDoc?.sourceCustomFieldId ??
      process.env.GHL_SOURCE_CUSTOM_FIELD_ID?.trim() ??
      null,
    lastTestedAt: mongoDoc?.lastTestedAt ?? null,
    lastTestOk: mongoDoc?.lastTestOk ?? null,
    lastTestError: mongoDoc?.lastTestError ?? null,
    pipelineCount,
    updatedAt: mongoDoc?.updatedAt ?? null,
    updatedBy: mongoDoc?.updatedBy ?? null,
  };
}

/** GET /api/settings/ghl — masked GHL integration status (logged-in admins). */
export async function GET() {
  const session = await requireDashboardSession();
  if (!session) return unauthorized();
  return NextResponse.json(await buildStatusPayload());
}

type SaveBody = {
  apiKey?: string;
  locationId?: string;
  baseUrl?: string;
  sourceCustomFieldId?: string | null;
  testOnly?: boolean;
};

/** POST /api/settings/ghl — test and save GHL credentials to MongoDB. */
export async function POST(request: Request) {
  const session = await requireDashboardSession();
  if (!session) return unauthorized();

  if (!isMongoConfigured()) {
    return NextResponse.json(
      { ok: false, error: "MONGODB_URI is not configured" },
      { status: 503 },
    );
  }

  let body: SaveBody;
  try {
    body = (await request.json()) as SaveBody;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const locationId = body.locationId?.trim();
  if (!locationId) {
    return NextResponse.json(
      { ok: false, error: "Location ID is required" },
      { status: 400 },
    );
  }

  const existing = await getGhlIntegrationDoc();
  let apiKey = body.apiKey?.trim() ?? "";
  if (!apiKey && existing?.apiKeyEncrypted) {
    try {
      apiKey = await decryptGhlApiKey(existing);
    } catch {
      return NextResponse.json(
        { ok: false, error: "Existing API key could not be decrypted. Re-enter the API key." },
        { status: 400 },
      );
    }
  }
  if (!apiKey) {
    return NextResponse.json(
      { ok: false, error: "API key is required" },
      { status: 400 },
    );
  }

  const config: GhlConfig = {
    apiKey,
    locationId,
    baseUrl: normalizeBaseUrl(body.baseUrl ?? existing?.baseUrl),
    sourceCustomFieldId:
      body.sourceCustomFieldId === undefined
        ? existing?.sourceCustomFieldId ?? null
        : body.sourceCustomFieldId?.trim() || null,
  };

  const testedAt = new Date().toISOString();
  const test = await testGhlConnection(config);

  if (body.testOnly) {
    return NextResponse.json({
      ok: test.ok,
      test,
      error: test.ok ? undefined : test.error,
    });
  }

  if (!test.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: test.error ?? "GoHighLevel connection test failed",
        test,
      },
      { status: 400 },
    );
  }

  await upsertGhlIntegrationDoc({
    locationId: config.locationId,
    apiKeyEncrypted: encryptSecret(config.apiKey),
    baseUrl: config.baseUrl,
    sourceCustomFieldId: config.sourceCustomFieldId,
    updatedAt: testedAt,
    updatedBy: session.email,
    lastTestedAt: testedAt,
    lastTestOk: true,
    lastTestError: undefined,
    locationName: test.locationName,
    pipelineCount: test.pipelineCount,
  });

  return NextResponse.json(await buildStatusPayload());
}

/** DELETE /api/settings/ghl — remove Mongo credentials (env fallback remains). */
export async function DELETE() {
  const session = await requireDashboardSession();
  if (!session) return unauthorized();

  if (!isMongoConfigured()) {
    return NextResponse.json(
      { ok: false, error: "MONGODB_URI is not configured" },
      { status: 503 },
    );
  }

  await deleteGhlIntegrationDoc();
  return NextResponse.json(await buildStatusPayload());
}

/** POST test using saved credentials without re-saving. */
export async function PATCH() {
  const session = await requireDashboardSession();
  if (!session) return unauthorized();

  try {
    const config = await getGhlConfig();
    const test = await testGhlConnection(config);
    const testedAt = new Date().toISOString();
    const mongoDoc = await getGhlIntegrationDoc();

    if (mongoDoc && (await resolveGhlConfigSource()) === "mongo") {
      await upsertGhlIntegrationDoc({
        ...mongoDoc,
        lastTestedAt: testedAt,
        lastTestOk: test.ok,
        lastTestError: test.ok ? undefined : test.error,
        pipelineCount: test.pipelineCount,
        locationName: test.locationName ?? mongoDoc.locationName,
        updatedAt: mongoDoc.updatedAt,
        updatedBy: mongoDoc.updatedBy,
      });
    }

    const status = await buildStatusPayload();
    return NextResponse.json({
      ...status,
      ok: test.ok,
      test,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Not configured";
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }
}
