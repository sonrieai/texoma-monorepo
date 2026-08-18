const encoder = new TextEncoder();

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const padLen = (4 - (padded.length % 4)) % 4;
  const base64 = padded + "=".repeat(padLen);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function importHmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export async function signPayload(
  payload: string,
  secret: string,
): Promise<string> {
  const key = await importHmacKey(secret);
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(payload),
  );
  return base64UrlEncode(new Uint8Array(signature));
}

export async function verifyPayload(
  payload: string,
  signature: string,
  secret: string,
): Promise<boolean> {
  const key = await importHmacKey(secret);
  try {
    const sigBytes = base64UrlDecode(signature);
    const copy = new Uint8Array(sigBytes.length);
    copy.set(sigBytes);
    return crypto.subtle.verify("HMAC", key, copy, encoder.encode(payload));
  } catch {
    return false;
  }
}

export function encodeJsonBase64Url(value: unknown): string {
  return base64UrlEncode(encoder.encode(JSON.stringify(value)));
}

export function decodeJsonBase64Url<T>(value: string): T | null {
  try {
    const bytes = base64UrlDecode(value);
    const json = new TextDecoder().decode(bytes);
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}
