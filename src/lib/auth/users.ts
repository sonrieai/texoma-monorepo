import "server-only";

import { randomUUID } from "node:crypto";
import { getAuthEmail, getAuthUsername } from "@/lib/auth/config";
import { hashPassword, verifyPasswordHash } from "@/lib/auth/password";
import {
  readJsonStore,
  updateJsonStore,
  type StoredDashboardUser,
  type StoredPasswordReset,
} from "@/lib/store/json-store";

export const AUTH_COLLECTIONS = {
  dashboardUsers: "dashboardUsers",
  passwordResets: "passwordResets",
} as const;

export type DashboardUserDoc = {
  id: string;
  username: string;
  email: string;
  passwordHash: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  lastPasswordReset?: Date;
};

export type PasswordResetDoc = {
  id: string;
  userId: string;
  email: string;
  resetToken: string;
  isUsed: boolean;
  expiresAt: Date;
  createdAt: Date;
};

function toStoredUser(user: DashboardUserDoc): StoredDashboardUser {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    passwordHash: user.passwordHash,
    isActive: user.isActive,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
    lastPasswordReset: user.lastPasswordReset?.toISOString(),
  };
}

function fromStoredUser(user: StoredDashboardUser): DashboardUserDoc {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    passwordHash: user.passwordHash,
    isActive: user.isActive,
    createdAt: new Date(user.createdAt),
    updatedAt: new Date(user.updatedAt),
    lastPasswordReset: user.lastPasswordReset
      ? new Date(user.lastPasswordReset)
      : undefined,
  };
}

function fromStoredReset(record: StoredPasswordReset): PasswordResetDoc {
  return {
    id: record.id,
    userId: record.userId,
    email: record.email,
    resetToken: record.resetToken,
    isUsed: record.isUsed,
    expiresAt: new Date(record.expiresAt),
    createdAt: new Date(record.createdAt),
  };
}

/** Kept so login and password-reset routes can await store readiness. */
export async function ensureAuthIndexes(): Promise<void> {
  await readJsonStore();
}

export async function ensureDashboardAdminFromEnv(): Promise<DashboardUserDoc | null> {
  const envPassword = process.env.AUTH_PASSWORD?.trim();
  if (!envPassword) return null;

  const email = getAuthEmail();
  if (!email) return null;

  const now = new Date();
  const user: DashboardUserDoc = {
    id: randomUUID(),
    username: getAuthUsername(),
    email: email.toLowerCase(),
    passwordHash: hashPassword(envPassword),
    isActive: true,
    createdAt: now,
    updatedAt: now,
  };

  let created = false;
  await updateJsonStore((store) => {
    if (store.dashboardUsers.length > 0) return;
    store.dashboardUsers.push(toStoredUser(user));
    created = true;
  });
  return created ? user : null;
}

export async function findDashboardUserByEmail(
  email: string,
): Promise<DashboardUserDoc | null> {
  await ensureDashboardAdminFromEnv();
  const normalized = email.trim().toLowerCase();
  const store = await readJsonStore();
  const match = store.dashboardUsers.find(
    (user) => user.isActive && user.email === normalized,
  );
  return match ? fromStoredUser(match) : null;
}

export async function verifyDashboardUserPassword(
  user: DashboardUserDoc,
  password: string,
): Promise<boolean> {
  return verifyPasswordHash(password, user.passwordHash);
}

export async function updateDashboardUserPassword(
  userId: string,
  newPassword: string,
): Promise<boolean> {
  let matched = false;
  const now = new Date().toISOString();
  await updateJsonStore((store) => {
    const user = store.dashboardUsers.find(
      (row) => row.id === userId && row.isActive,
    );
    if (!user) return;
    user.passwordHash = hashPassword(newPassword);
    user.updatedAt = now;
    user.lastPasswordReset = now;
    matched = true;
  });
  return matched;
}

export async function countRecentPasswordResetRequests(
  email: string,
  windowMs: number,
): Promise<number> {
  const normalized = email.trim().toLowerCase();
  const since = Date.now() - windowMs;
  const store = await readJsonStore();
  return store.passwordResets.filter(
    (row) =>
      row.email === normalized && new Date(row.createdAt).getTime() >= since,
  ).length;
}

export async function insertPasswordResetRecord(input: {
  userId: string;
  email: string;
  resetToken: string;
  expiresAt: Date;
}): Promise<void> {
  const record: StoredPasswordReset = {
    id: randomUUID(),
    userId: input.userId,
    email: input.email.trim().toLowerCase(),
    resetToken: input.resetToken,
    isUsed: false,
    expiresAt: input.expiresAt.toISOString(),
    createdAt: new Date().toISOString(),
  };
  await updateJsonStore((store) => {
    store.passwordResets.push(record);
  });
}

export async function findPasswordResetByToken(
  resetToken: string,
): Promise<PasswordResetDoc | null> {
  const store = await readJsonStore();
  const match = store.passwordResets.find((row) => row.resetToken === resetToken);
  return match ? fromStoredReset(match) : null;
}

export async function findLatestUnusedPasswordReset(
  email: string,
): Promise<PasswordResetDoc | null> {
  const normalized = email.trim().toLowerCase();
  const store = await readJsonStore();
  const matches = store.passwordResets
    .filter((row) => row.email === normalized && !row.isUsed)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return matches[0] ? fromStoredReset(matches[0]) : null;
}

export async function markPasswordResetUsed(resetToken: string): Promise<void> {
  await updateJsonStore((store) => {
    const row = store.passwordResets.find((item) => item.resetToken === resetToken);
    if (row) row.isUsed = true;
  });
}

export async function findDashboardUserById(
  userId: string,
): Promise<DashboardUserDoc | null> {
  const store = await readJsonStore();
  const match = store.dashboardUsers.find(
    (user) => user.id === userId && user.isActive,
  );
  return match ? fromStoredUser(match) : null;
}

export async function saveDashboardUser(user: DashboardUserDoc): Promise<void> {
  const stored = toStoredUser(user);
  await updateJsonStore((store) => {
    const index = store.dashboardUsers.findIndex((row) => row.id === user.id);
    if (index >= 0) store.dashboardUsers[index] = stored;
    else store.dashboardUsers.push(stored);
  });
}

export async function deleteAuthRecordsByEmail(email: string): Promise<void> {
  const normalized = email.trim().toLowerCase();
  await updateJsonStore((store) => {
    store.dashboardUsers = store.dashboardUsers.filter(
      (user) => user.email !== normalized,
    );
    store.passwordResets = store.passwordResets.filter(
      (row) => row.email !== normalized,
    );
  });
}
