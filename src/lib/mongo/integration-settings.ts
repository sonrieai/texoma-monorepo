import "server-only";

import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from "node:crypto";
import { readJsonStore, updateJsonStore } from "@/lib/store/json-store";

export const GHL_INTEGRATION_ID = "ghl" as const;

export type GhlIntegrationDoc = {
  _id: typeof GHL_INTEGRATION_ID;
  locationId: string;
  apiKeyEncrypted: string;
  baseUrl: string;
  sourceCustomFieldId?: string | null;
  updatedAt: string;
  updatedBy: string;
  lastTestedAt?: string;
  lastTestOk?: boolean;
  lastTestError?: string;
  locationName?: string;
  pipelineCount?: number;
};

const DEFAULT_BASE_URL = "https://services.leadconnectorhq.com";
const ENCRYPTION_PREFIX = "v1";
const SCRYPT_SALT = "texoma-ghl-integration";

function getEncryptionKey(): Buffer {
  const secret =
    process.env.INTEGRATION_ENCRYPTION_KEY?.trim() ||
    process.env.AUTH_SESSION_SECRET?.trim();
  if (!secret || secret.length < 32) {
    throw new Error(
      "Set AUTH_SESSION_SECRET (≥32 chars) or INTEGRATION_ENCRYPTION_KEY for GHL credential storage.",
    );
  }
  return scryptSync(secret, SCRYPT_SALT, 32);
}

export function encryptSecret(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return `${ENCRYPTION_PREFIX}:${iv.toString("base64")}:${tag.toString("base64")}:${encrypted.toString("base64")}`;
}

export function decryptSecret(stored: string): string {
  const parts = stored.split(":");
  if (parts.length !== 4 || parts[0] !== ENCRYPTION_PREFIX) {
    throw new Error("Invalid encrypted secret format");
  }
  const key = getEncryptionKey();
  const iv = Buffer.from(parts[1], "base64");
  const tag = Buffer.from(parts[2], "base64");
  const encrypted = Buffer.from(parts[3], "base64");
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]).toString("utf8");
}

export function maskApiKey(apiKey: string): string {
  if (apiKey.length <= 4) return "••••";
  return `••••••••${apiKey.slice(-4)}`;
}

export function defaultGhlBaseUrl(): string {
  return DEFAULT_BASE_URL;
}

export async function getGhlIntegrationDoc(): Promise<GhlIntegrationDoc | null> {
  const store = await readJsonStore();
  return store.ghl;
}

export async function upsertGhlIntegrationDoc(
  doc: Omit<GhlIntegrationDoc, "_id">,
): Promise<void> {
  const saved: GhlIntegrationDoc = { _id: GHL_INTEGRATION_ID, ...doc };
  await updateJsonStore((store) => {
    store.ghl = saved;
  });
}

export async function deleteGhlIntegrationDoc(): Promise<boolean> {
  const existing = await getGhlIntegrationDoc();
  if (!existing) return false;
  await updateJsonStore((store) => {
    store.ghl = null;
  });
  return true;
}

export async function decryptGhlApiKey(
  doc: GhlIntegrationDoc,
): Promise<string> {
  return decryptSecret(doc.apiKeyEncrypted);
}
