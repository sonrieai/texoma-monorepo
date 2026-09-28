/**
 * Probe Open Dental Remote API with the public sandbox key from
 * https://opendental.com/site/apisetup.html
 *
 * Usage:
 *   npx tsx scripts/probe-opendental-api.ts
 *
 * Optional env (live keys later — never commit):
 *   OPENDENTAL_DEVELOPER_KEY
 *   OPENDENTAL_CUSTOMER_KEY
 *   OPENDENTAL_BASE_URL   default https://api.opendental.com/api/v1
 */
const DEFAULT_BASE = "https://api.opendental.com/api/v1";
/** Official Open Dental developer test pair (their sandbox, not Texoma). */
const PUBLIC_TEST_AUTH = "ODFHIR NFF6i0KrXrxDkZHt/VzkmZEaUWOjnQX2z";

const TIMEOUT_MS = 25_000;

function authorizationHeader(): string {
  const dev = process.env.OPENDENTAL_DEVELOPER_KEY?.trim();
  const cust = process.env.OPENDENTAL_CUSTOMER_KEY?.trim();
  if (dev && cust) return `ODFHIR ${dev}/${cust}`;
  return PUBLIC_TEST_AUTH;
}

function usingPublicSandbox(): boolean {
  const dev = process.env.OPENDENTAL_DEVELOPER_KEY?.trim();
  const cust = process.env.OPENDENTAL_CUSTOMER_KEY?.trim();
  return !(dev && cust);
}

type Probe = { name: string; path: string };

function todayYmd(): string {
  return new Date().toISOString().slice(0, 10);
}

function daysAgoYmd(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

function probes(): Probe[] {
  const start = daysAgoYmd(30);
  const end = todayYmd();
  return [
    { name: "providers", path: "/providers?Limit=5" },
    { name: "clinics", path: "/clinics?Limit=5" },
    { name: "appointments", path: `/appointments?DateStart=${start}&DateEnd=${end}&Limit=5` },
    { name: "procedurelogs", path: `/procedurelogs?DateStart=${start}&DateEnd=${end}&Limit=5` },
    { name: "treatplans", path: "/treatplans?Limit=5" },
    { name: "proctps", path: "/proctps?Limit=5" },
    { name: "patients-simple", path: "/patients?Limit=3" },
  ];
}

async function getJson(
  baseUrl: string,
  path: string,
  auth: string,
): Promise<{ status: number; ok: boolean; preview: string; itemHint: string }> {
  const url = `${baseUrl.replace(/\/$/, "")}${path}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: auth,
        Accept: "application/json",
      },
      signal: controller.signal,
    });
    const text = await res.text();
    let preview = text.slice(0, 400).replace(/\s+/g, " ");
    let itemHint = "n/a";
    try {
      const json: unknown = JSON.parse(text);
      if (Array.isArray(json)) itemHint = `${json.length} items`;
      else if (json && typeof json === "object") {
        const keys = Object.keys(json as object).slice(0, 8).join(", ");
        itemHint = `object keys: ${keys || "(empty)"}`;
      }
    } catch {
      itemHint = "non-JSON body";
    }
    if (!res.ok && preview.length === 0) preview = res.statusText;
    return { status: res.status, ok: res.ok, preview, itemHint };
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  const baseUrl = (
    process.env.OPENDENTAL_BASE_URL?.trim() || DEFAULT_BASE
  ).replace(/\/$/, "");
  const auth = authorizationHeader();

  console.log("Open Dental API probe");
  console.log(`  base:   ${baseUrl}`);
  console.log(
    `  auth:   ${usingPublicSandbox() ? "public sandbox (OD docs)" : "env OPENDENTAL_* keys"}`,
  );
  console.log("");

  let anyOk = false;
  for (const probe of probes()) {
    try {
      const result = await getJson(baseUrl, probe.path, auth);
      const mark = result.ok ? "OK " : "FAIL";
      console.log(`[${mark}] ${probe.name}  HTTP ${result.status}  ${result.itemHint}`);
      console.log(`       GET ${probe.path}`);
      if (result.preview) console.log(`       ${result.preview}`);
      console.log("");
      if (result.ok) anyOk = true;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.log(`[FAIL] ${probe.name}  ${msg}`);
      console.log(`       GET ${probe.path}`);
      console.log("");
    }
  }

  if (!anyOk) {
    console.error(
      "No GET succeeded. If HTTP 401 says the sandbox key is disabled, that is expected — request Developer Portal access and set OPENDENTAL_DEVELOPER_KEY + OPENDENTAL_CUSTOMER_KEY.",
    );
    process.exitCode = 1;
    return;
  }
  console.log("At least one GET succeeded — Open Dental API is reachable with this key.");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
