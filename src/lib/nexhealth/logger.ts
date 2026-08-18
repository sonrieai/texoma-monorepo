/**
 * NexHealth request logging (server-only).
 * Enable with NEXHEALTH_DEBUG=1 (or true). Never logs tokens or PHI payloads.
 */

const REDACT_QUERY_KEYS = new Set([
  "email",
  "phone",
  "ssn",
  "authorization",
  "token",
]);

export function isNexHealthDebugEnabled(): boolean {
  const flag = process.env.NEXHEALTH_DEBUG?.trim().toLowerCase();
  if (flag === "1" || flag === "true" || flag === "yes") return true;
  if (flag === "0" || flag === "false" || flag === "no") return false;
  return process.env.NODE_ENV === "development";
}

type LogQueryValue = string | number | boolean | Array<string | number> | undefined;

function sanitizeQuery(
  query: Record<string, LogQueryValue>,
): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === "") continue;
    if (REDACT_QUERY_KEYS.has(key.toLowerCase())) {
      out[key] = "[redacted]";
      continue;
    }
    if (Array.isArray(value)) {
      out[key] = value.join(",");
      continue;
    }
    out[key] = value;
  }
  return out;
}

function summarizeBody(body: unknown): {
  keys?: string[];
  listCount?: number;
  listKey?: string;
} {
  if (!body || typeof body !== "object") return {};
  const root = body as Record<string, unknown>;
  const keys = Object.keys(root).slice(0, 12);

  const data = root.data;
  if (Array.isArray(data)) {
    return { keys, listCount: data.length, listKey: "data" };
  }
  if (data && typeof data === "object") {
    const record = data as Record<string, unknown>;
    for (const key of [
      "appointments",
      "patients",
      "providers",
      "locations",
      "procedures",
    ]) {
      if (Array.isArray(record[key])) {
        return {
          keys,
          listCount: (record[key] as unknown[]).length,
          listKey: `data.${key}`,
        };
      }
    }
    if (Array.isArray(record.data)) {
      return {
        keys,
        listCount: record.data.length,
        listKey: "data.data",
      };
    }
  }
  return { keys };
}

export function logNexHealth(
  event: string,
  details: Record<string, unknown>,
): void {
  if (!isNexHealthDebugEnabled()) return;
  // Single-line JSON keeps server logs readable and greppable
  console.info(
    `[nexhealth] ${event}`,
    JSON.stringify({
      ...details,
      at: new Date().toISOString(),
    }),
  );
}

export function logNexHealthRequest(input: {
  method: string;
  path: string;
  query?: Record<string, LogQueryValue>;
}): void {
  logNexHealth("request", {
    method: input.method,
    path: input.path,
    query: sanitizeQuery(input.query || {}),
  });
}

export function logNexHealthResponse(input: {
  method: string;
  path: string;
  status: number;
  ms: number;
  body?: unknown;
  error?: string;
}): void {
  const summary = summarizeBody(input.body);
  logNexHealth(input.error ? "error" : "response", {
    method: input.method,
    path: input.path,
    status: input.status,
    ms: input.ms,
    ...summary,
    ...(input.error ? { error: input.error.slice(0, 200) } : {}),
  });
}
