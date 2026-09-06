import {
  decodeJsonBase64Url,
  encodeJsonBase64Url,
  signPayload,
  verifyPayload,
} from "@/lib/auth/crypto";
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE_SEC,
  isAuthEnabled,
  requireAuthSessionSecret,
} from "@/lib/auth/config";
import { SESSION_INACTIVITY_TIMEOUT_SEC } from "@/lib/auth/session-constants";

type SessionPayload = {
  sub: string;
  exp: number;
  lastAct: number;
};

export type Session = {
  email: string;
  expiresAt: number;
  lastActivityAt: number;
  inactivityExpiresAt: number;
};

function splitSessionToken(token: string): { payload: string; signature: string } | null {
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const payload = token.slice(0, dot);
  const signature = token.slice(dot + 1);
  if (!payload || !signature) return null;
  return { payload, signature };
}

function decodeSessionPayload(payloadB64: string): SessionPayload | null {
  const decoded = decodeJsonBase64Url<Partial<SessionPayload>>(payloadB64);
  if (!decoded?.sub || typeof decoded.exp !== "number") return null;

  const nowSec = Math.floor(Date.now() / 1000);
  const lastAct =
    typeof decoded.lastAct === "number"
      ? decoded.lastAct
      : decoded.exp - SESSION_MAX_AGE_SEC;

  return {
    sub: decoded.sub.trim().toLowerCase(),
    exp: decoded.exp,
    lastAct,
  };
}

function isSessionInactive(lastActSec: number, nowSec = Math.floor(Date.now() / 1000)): boolean {
  return nowSec - lastActSec > SESSION_INACTIVITY_TIMEOUT_SEC;
}

export async function createSessionToken(email: string): Promise<string> {
  const secret = requireAuthSessionSecret();
  const nowSec = Math.floor(Date.now() / 1000);
  const payload = encodeJsonBase64Url({
    sub: email.trim().toLowerCase(),
    exp: nowSec + SESSION_MAX_AGE_SEC,
    lastAct: nowSec,
  } satisfies SessionPayload);
  const signature = await signPayload(payload, secret);
  return `${payload}.${signature}`;
}

export async function refreshSessionToken(
  email: string,
  absoluteExpSec: number,
): Promise<string> {
  const secret = requireAuthSessionSecret();
  const nowSec = Math.floor(Date.now() / 1000);
  const payload = encodeJsonBase64Url({
    sub: email.trim().toLowerCase(),
    exp: absoluteExpSec,
    lastAct: nowSec,
  } satisfies SessionPayload);
  const signature = await signPayload(payload, secret);
  return `${payload}.${signature}`;
}

export async function verifySessionToken(token: string | undefined): Promise<Session | null> {
  if (!isAuthEnabled() || !token) return null;

  const parts = splitSessionToken(token);
  if (!parts) return null;

  const secret = process.env.AUTH_SESSION_SECRET?.trim();
  if (!secret) return null;

  const valid = await verifyPayload(parts.payload, parts.signature, secret);
  if (!valid) return null;

  const decoded = decodeSessionPayload(parts.payload);
  if (!decoded) return null;

  const nowSec = Math.floor(Date.now() / 1000);
  if (decoded.exp <= nowSec) return null;
  if (isSessionInactive(decoded.lastAct, nowSec)) return null;

  const lastActivityAt = decoded.lastAct * 1000;
  return {
    email: decoded.sub,
    expiresAt: decoded.exp * 1000,
    lastActivityAt,
    inactivityExpiresAt: lastActivityAt + SESSION_INACTIVITY_TIMEOUT_SEC * 1000,
  };
}

export function getSessionCookieName(): string {
  return SESSION_COOKIE;
}

export function sessionCookieOptions(expiresAt: Date) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    expires: expiresAt,
    maxAge: SESSION_MAX_AGE_SEC,
  };
}

export async function readSessionPayloadFromToken(
  token: string | undefined,
): Promise<SessionPayload | null> {
  if (!token) return null;
  const parts = splitSessionToken(token);
  if (!parts) return null;

  const secret = process.env.AUTH_SESSION_SECRET?.trim();
  if (!secret) return null;

  const valid = await verifyPayload(parts.payload, parts.signature, secret);
  if (!valid) return null;

  const decoded = decodeSessionPayload(parts.payload);
  if (!decoded) return null;

  const nowSec = Math.floor(Date.now() / 1000);
  if (decoded.exp <= nowSec) return null;
  if (isSessionInactive(decoded.lastAct, nowSec)) return null;

  return decoded;
}
