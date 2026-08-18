/** Chart / map shared types (not demo data). */

export type GeoCity = {
  city: string;
  county: string | null;
  lat: number | null;
  lon: number | null;
  patients: number;
  /** null until charge-to-area mapping exists */
  production: number | null;
  camp?: string[];
};

export const CHANNEL_COLORS = [
  "var(--c1)",
  "var(--c2)",
  "var(--c3)",
  "var(--c4)",
  "var(--c5)",
  "var(--c6)",
  "var(--c7)",
  "var(--c8)",
] as const;
