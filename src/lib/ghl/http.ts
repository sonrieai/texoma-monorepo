import { getGhlConfig, type GhlConfig } from "@/lib/ghl/config";

const GHL_API_VERSION = "2021-07-28";
const DEFAULT_TIMEOUT_MS = 25_000;

export class GhlApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "GhlApiError";
    this.status = status;
  }
}

export async function ghlFetch<T>(
  path: string,
  init: RequestInit = {},
  config?: GhlConfig,
): Promise<T> {
  const cfg = config ?? (await getGhlConfig());
  const url = path.startsWith("http")
    ? path
    : `${cfg.baseUrl}${path.startsWith("/") ? path : `/${path}`}`;

  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${cfg.apiKey}`);
  headers.set("Version", GHL_API_VERSION);
  headers.set("Accept", "application/json");
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      ...init,
      headers,
      signal: controller.signal,
      cache: "no-store",
    });
    const text = await res.text();
    let json: unknown = null;
    if (text) {
      try {
        json = JSON.parse(text) as unknown;
      } catch {
        json = { raw: text };
      }
    }
    if (!res.ok) {
      const msg =
        typeof json === "object" &&
        json &&
        "message" in json &&
        typeof (json as { message: unknown }).message === "string"
          ? (json as { message: string }).message
          : text.slice(0, 200) || res.statusText;
      throw new GhlApiError(res.status, `GHL ${res.status}: ${msg}`);
    }
    return json as T;
  } finally {
    clearTimeout(timer);
  }
}
