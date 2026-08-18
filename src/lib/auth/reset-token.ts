import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { getResetTokenSecret } from "@/lib/auth/config";

const RESET_TOKEN_TTL_HOURS = 2;

type ResetTokenPayload = {
  user_type: "dashboard";
  user_id: string;
  email: string;
  exp: number;
  iat: number;
};

function base64UrlEncode(value: string): string {
  return Buffer.from(value, "utf8")
    .toString("base64url")
    .replace(/=+$/, "");
}

function base64UrlDecode(value: string): string {
  const padded = value.padEnd(value.length + ((4 - (value.length % 4)) % 4), "=");
  return Buffer.from(padded, "base64url").toString("utf8");
}

function signMessage(message: string, secret: string): string {
  return createHmac("sha256", secret).update(message).digest("base64url");
}

export function createSignedResetToken(input: {
  userId: string;
  email: string;
  expiresInHours?: number;
}): string {
  const secret = getResetTokenSecret();
  const expiresInHours = input.expiresInHours ?? RESET_TOKEN_TTL_HOURS;
  const now = Math.floor(Date.now() / 1000);
  const payload: ResetTokenPayload = {
    user_type: "dashboard",
    user_id: input.userId,
    email: input.email.trim().toLowerCase(),
    exp: now + expiresInHours * 60 * 60,
    iat: now,
  };

  const headerB64 = base64UrlEncode(JSON.stringify({ alg: "HS256", typ: "reset" }));
  const payloadB64 = base64UrlEncode(JSON.stringify(payload));
  const message = `${headerB64}.${payloadB64}`;
  const signatureB64 = signMessage(message, secret);
  return `${message}.${signatureB64}`;
}

export function verifySignedResetToken(token: string): ResetTokenPayload {
  const secret = getResetTokenSecret();
  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new Error("Invalid reset token format");
  }

  const [headerB64, payloadB64, signatureB64] = parts;
  const message = `${headerB64}.${payloadB64}`;
  const expectedSignature = signMessage(message, secret);

  const sigBuf = Buffer.from(signatureB64);
  const expectedBuf = Buffer.from(expectedSignature);
  if (
    sigBuf.length !== expectedBuf.length ||
    !timingSafeEqual(sigBuf, expectedBuf)
  ) {
    throw new Error("Invalid reset token signature");
  }

  const payload = JSON.parse(base64UrlDecode(payloadB64)) as ResetTokenPayload;
  if (payload.user_type !== "dashboard") {
    throw new Error("Invalid reset token type");
  }
  if (!payload.user_id || !payload.email || typeof payload.exp !== "number") {
    throw new Error("Invalid reset token payload");
  }
  if (Math.floor(Date.now() / 1000) > payload.exp) {
    throw new Error("Reset token has expired");
  }

  return payload;
}

export function getResetTokenTtlMs(): number {
  return RESET_TOKEN_TTL_HOURS * 60 * 60 * 1000;
}
