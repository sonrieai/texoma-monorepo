/**
 * Geocode US patient addresses via Census Bureau API (no API key).
 * Coordinates are derived from synced Open Dental address fields — not hardcoded.
 */

export type GeocodeResult = {
  lat: number;
  lon: number;
  county: string | null;
  source: "census" | "nominatim";
};

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_LOOKUPS_PER_RUN = 60;
const CENSUS_CONCURRENCY = 8;

type CacheEntry = { expiresAt: number; result: GeocodeResult | null };
type GeocodeCache = Map<string, CacheEntry>;

const cache: GeocodeCache = ((
  globalThis as { __texomaGeocode?: GeocodeCache }
).__texomaGeocode ??= new Map());

export function normalizeGeocodeKey(query: string): string {
  return query.trim().toLowerCase().replace(/\s+/g, " ");
}

function cacheKey(query: string): string {
  return normalizeGeocodeKey(query);
}

function parseCensusMatch(json: unknown): GeocodeResult | null {
  if (!json || typeof json !== "object") return null;
  const result = (json as { result?: { addressMatches?: unknown[] } }).result;
  const match = result?.addressMatches?.[0] as
    | {
        coordinates?: { x?: number; y?: number };
        addressComponents?: { county?: string };
      }
    | undefined;
  const x = match?.coordinates?.x;
  const y = match?.coordinates?.y;
  if (typeof x !== "number" || typeof y !== "number") return null;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return {
    lon: x,
    lat: y,
    county: match?.addressComponents?.county?.trim() || null,
    source: "census",
  };
}

async function geocodeCensus(query: string): Promise<GeocodeResult | null> {
  const url = new URL(
    "https://geocoding.geo.census.gov/geocoder/locations/onelineaddress",
  );
  url.searchParams.set("address", query);
  url.searchParams.set("benchmark", "Public_AR_Current");
  url.searchParams.set("format", "json");

  const res = await fetch(url.toString(), {
    cache: "force-cache",
    next: { revalidate: 60 * 60 * 24 * 7 },
  });
  if (!res.ok) return null;
  return parseCensusMatch(await res.json());
}

async function geocodeNominatim(query: string): Promise<GeocodeResult | null> {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", query);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "1");
  if (/\b[A-Z]{2}\b/.test(query) || /\b\d{5}(?:-\d{4})?\b/.test(query)) {
    url.searchParams.set("countrycodes", "us");
  }

  const res = await fetch(url.toString(), {
    headers: {
      "User-Agent": "TexomaImplantDashboard/1.0 (practice BI; geocode from OD addresses)",
    },
    cache: "force-cache",
    next: { revalidate: 60 * 60 * 24 * 7 },
  });
  if (!res.ok) return null;

  const rows = (await res.json()) as { lat?: string; lon?: string }[];
  const hit = rows[0];
  if (!hit?.lat || !hit?.lon) return null;
  const lat = Number.parseFloat(hit.lat);
  const lon = Number.parseFloat(hit.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return { lat, lon, county: null, source: "nominatim" };
}

export async function geocodeAddressQuery(
  query: string,
): Promise<GeocodeResult | null> {
  const key = cacheKey(query);
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.result;

  let result = await geocodeCensus(query);
  if (!result) {
    await new Promise((r) => setTimeout(r, 1100));
    result = await geocodeNominatim(query);
  }

  cache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, result });
  return result;
}

/** Geocode unique address queries with a per-request cap. Census lookups run together. */
export async function geocodeAddressQueries(
  queries: string[],
): Promise<Map<string, GeocodeResult | null>> {
  const seen = new Set<string>();
  const uniqueQueries: string[] = [];
  for (const q of queries) {
    const k = cacheKey(q);
    if (!seen.has(k)) {
      seen.add(k);
      uniqueQueries.push(q);
    }
  }

  const out = new Map<string, GeocodeResult | null>();
  const pending: string[] = [];

  for (const query of uniqueQueries) {
    const normalized = cacheKey(query);
    const cached = cache.get(normalized);
    if (cached && cached.expiresAt > Date.now()) {
      out.set(normalized, cached.result);
      continue;
    }
    if (pending.length < MAX_LOOKUPS_PER_RUN) pending.push(query);
  }

  const misses: string[] = [];
  for (let i = 0; i < pending.length; i += CENSUS_CONCURRENCY) {
    const chunk = pending.slice(i, i + CENSUS_CONCURRENCY);
    const hits = await Promise.all(chunk.map((query) => geocodeCensus(query)));
    chunk.forEach((query, index) => {
      const result = hits[index] ?? null;
      if (result) {
        const normalized = cacheKey(query);
        cache.set(normalized, {
          expiresAt: Date.now() + CACHE_TTL_MS,
          result,
        });
        out.set(normalized, result);
      } else {
        misses.push(query);
      }
    });
  }

  for (const query of misses) {
    await new Promise((r) => setTimeout(r, 1100));
    const result = await geocodeNominatim(query);
    const normalized = cacheKey(query);
    cache.set(normalized, { expiresAt: Date.now() + CACHE_TTL_MS, result });
    out.set(normalized, result);
  }

  return out;
}

export function resetGeocodeCacheForTests(): void {
  cache.clear();
}
