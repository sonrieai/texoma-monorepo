import "server-only";

import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const SCRYPT_KEYLEN = 64;
const SCRYPT_OPTIONS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, SCRYPT_KEYLEN, SCRYPT_OPTIONS);
  return `scrypt$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export function verifyPasswordHash(password: string, stored: string): boolean {
  const parts = stored.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;

  try {
    const salt = Buffer.from(parts[1], "base64");
    const expected = Buffer.from(parts[2], "base64");
    const actual = scryptSync(password, salt, expected.length, SCRYPT_OPTIONS);
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

export function validateNewPassword(password: string): string | null {
  if (password.length < 8) {
    return "Password must be at least 8 characters.";
  }
  if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(password)) {
    return "Password must include uppercase, lowercase, and a number.";
  }
  return null;
}
