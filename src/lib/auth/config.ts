import "server-only";

import { isMongoConfigured } from "@/lib/mongo/client";

export const SESSION_COOKIE = "texoma_session";
export const SESSION_MAX_AGE_SEC = 7 * 24 * 60 * 60;

/** Canonical production dashboard URL (Vercel alias). */
export const PRODUCTION_APP_URL = "https://texoma.vercel.app";

export const PASSWORD_RESET_MAX_REQUESTS_PER_EMAIL = 15;
export const PASSWORD_RESET_RATE_WINDOW_MS = 60 * 60 * 1000;

export function isAuthEnabled(): boolean {
  return Boolean(
    process.env.AUTH_SESSION_SECRET?.trim() && isMongoConfigured(),
  );
}

export function getAuthUsername(): string {
  return process.env.AUTH_USERNAME?.trim() || "admin";
}

export function getAuthEmail(): string | null {
  return process.env.AUTH_EMAIL?.trim().toLowerCase() || null;
}

export function requireAuthSessionSecret(): string {
  const secret = process.env.AUTH_SESSION_SECRET?.trim();
  if (!secret) {
    throw new Error("AUTH_SESSION_SECRET is not configured");
  }
  if (secret.length < 32) {
    throw new Error("AUTH_SESSION_SECRET must be at least 32 characters");
  }
  return secret;
}

export function getResetTokenSecret(): string {
  const secret =
    process.env.RESET_TOKEN_SECRET?.trim() ||
    process.env.AUTH_SESSION_SECRET?.trim();
  if (!secret) {
    throw new Error("RESET_TOKEN_SECRET is not configured");
  }
  return secret;
}

export function isPasswordResetConfigured(): boolean {
  return Boolean(
    isAuthEnabled() &&
      getAuthEmail() &&
      process.env.MAILGUN_API_KEY?.trim(),
  );
}

export function canSeedDashboardAdmin(): boolean {
  return Boolean(
    getAuthEmail() && process.env.AUTH_PASSWORD?.trim(),
  );
}
