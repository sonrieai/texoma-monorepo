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

type SessionPayload = {
  sub: string;
  exp: number;
};

export type Session = {
  email: string;
  expiresAt: number;
};

function splitSessionToken(token: string): { payload: string; signature: string } | null {
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const payload = token.slice(0, dot);
  const signature = token.slice(dot + 1);
  if (!payload || !signature) return null;
  return { payload, signature };
}

export async function createSessionToken(email: string): Promise<string> {
  const secret = requireAuthSessionSecret();
  const exp = Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SEC;
  const payload = encodeJsonBase64Url({
    sub: email.trim().toLowerCase(),
    exp,
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

  const decoded = decodeJsonBase64Url<SessionPayload>(parts.payload);
  if (!decoded?.sub || typeof decoded.exp !== "number") return null;
  if (decoded.exp <= Math.floor(Date.now() / 1000)) return null;

  return {
    email: decoded.sub,
    expiresAt: decoded.exp * 1000,
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
