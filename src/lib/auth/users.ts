import "server-only";

import { randomUUID } from "node:crypto";
import { getAuthEmail, getAuthUsername } from "@/lib/auth/config";
import { hashPassword, verifyPasswordHash } from "@/lib/auth/password";
import {
  isProviderId,
  normalizeDashboardRole,
  type DashboardRole,
} from "@/lib/auth/roles";
import {
  readAppStore,
  updateAppStore,
} from "@/lib/store/app-store";
import type {
  StoredDashboardUser,
  StoredPasswordReset,
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
  role: DashboardRole;
  providerId: string | null;
  createdAt: Date;
  updatedAt: Date;
  lastPasswordReset?: Date;
};

export type DashboardUserPublic = {
  id: string;
  username: string;
  email: string;
  role: DashboardRole;
  providerId: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type DashboardUserMutation =
  | { ok: true; user: DashboardUserDoc }
  | { ok: false; status: 400 | 404 | 409; error: string };

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
    role: user.role,
    providerId: user.role === "doctor" ? user.providerId : null,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
    lastPasswordReset: user.lastPasswordReset?.toISOString(),
  };
}

export function toPublicUser(user: DashboardUserDoc): DashboardUserPublic {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    role: user.role,
    providerId: user.providerId,
    isActive: user.isActive,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}

function fromStoredUser(user: StoredDashboardUser): DashboardUserDoc {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    passwordHash: user.passwordHash,
    isActive: user.isActive,
    role: normalizeDashboardRole(user.role),
    providerId:
      typeof user.providerId === "string" && isProviderId(user.providerId.trim())
        ? user.providerId.trim()
        : null,
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
  await readAppStore();
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
    role: "owner",
    providerId: null,
    createdAt: now,
    updatedAt: now,
  };

  let created = false;
  await updateAppStore((store) => {
    if (store.dashboardUsers.length > 0) return;
    store.dashboardUsers.push(toStoredUser(user));
    created = true;
  });
  return created ? user : null;
}

export async function findActiveDashboardUserByEmail(
  email: string,
): Promise<DashboardUserDoc | null> {
  const normalized = email.trim().toLowerCase();
  const store = await readAppStore();
  const match = store.dashboardUsers.find(
    (user) => user.isActive && user.email === normalized,
  );
  return match ? fromStoredUser(match) : null;
}

export async function findDashboardUserByEmail(
  email: string,
): Promise<DashboardUserDoc | null> {
  await ensureDashboardAdminFromEnv();
  return findActiveDashboardUserByEmail(email);
}

export async function listDashboardUsers(): Promise<DashboardUserDoc[]> {
  const store = await readAppStore();
  return store.dashboardUsers
    .map(fromStoredUser)
    .sort((a, b) => a.email.localeCompare(b.email));
}

function cleanProviderId(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed && isProviderId(trimmed) ? trimmed : null;
}

function isActiveOwner(user: StoredDashboardUser): boolean {
  return user.isActive && normalizeDashboardRole(user.role) === "owner";
}

export async function createDashboardUser(input: {
  username: string;
  email: string;
  password: string;
  role: DashboardRole;
  providerId?: string | null;
}): Promise<DashboardUserMutation> {
  const username = input.username.trim();
  const email = input.email.trim().toLowerCase();
  const providerId =
    input.role === "doctor" ? cleanProviderId(input.providerId) : null;
  if (!username) {
    return { ok: false, status: 400, error: "Name is required." };
  }
  if (input.role === "doctor" && !providerId) {
    return { ok: false, status: 400, error: "Choose a provider for a doctor." };
  }

  const now = new Date();
  const user: DashboardUserDoc = {
    id: randomUUID(),
    username,
    email,
    passwordHash: hashPassword(input.password),
    isActive: true,
    role: input.role,
    providerId,
    createdAt: now,
    updatedAt: now,
  };

  let result: DashboardUserMutation = { ok: true, user };
  await updateAppStore((store) => {
    if (store.dashboardUsers.some((row) => row.email === email)) {
      result = {
        ok: false,
        status: 409,
        error: "A user with this email already exists.",
      };
      return;
    }
    store.dashboardUsers.push(toStoredUser(user));
  });
  return result;
}

export async function updateDashboardUserAccess(
  userId: string,
  patch: {
    role?: DashboardRole;
    providerId?: string | null;
    isActive?: boolean;
  },
): Promise<DashboardUserMutation> {
  let result: DashboardUserMutation = {
    ok: false,
    status: 404,
    error: "User not found.",
  };

  await updateAppStore((store) => {
    const user = store.dashboardUsers.find((row) => row.id === userId);
    if (!user) {
      result = { ok: false, status: 404, error: "User not found." };
      return;
    }

    const nextRole = patch.role ?? normalizeDashboardRole(user.role);
    const nextActive = patch.isActive ?? user.isActive;
    const nextProvider =
      nextRole === "doctor"
        ? cleanProviderId(
            patch.providerId === undefined ? user.providerId : patch.providerId,
          )
        : null;

    if (nextRole === "doctor" && !nextProvider) {
      result = {
        ok: false,
        status: 400,
        error: "Choose a provider for a doctor.",
      };
      return;
    }

    const wasActiveOwner = isActiveOwner(user);
    const willBeActiveOwner = nextActive && nextRole === "owner";
    if (wasActiveOwner && !willBeActiveOwner) {
      const owners = store.dashboardUsers.filter(isActiveOwner);
      if (owners.length <= 1) {
        result = {
          ok: false,
          status: 409,
          error: "The last owner cannot be demoted or deactivated.",
        };
        return;
      }
    }

    user.role = nextRole;
    user.providerId = nextProvider;
    user.isActive = nextActive;
    user.updatedAt = new Date().toISOString();
    result = { ok: true, user: fromStoredUser(user) };
  });

  return result;
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
  await updateAppStore((store) => {
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
  const store = await readAppStore();
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
  await updateAppStore((store) => {
    store.passwordResets.push(record);
  });
}

export async function findPasswordResetByToken(
  resetToken: string,
): Promise<PasswordResetDoc | null> {
  const store = await readAppStore();
  const match = store.passwordResets.find((row) => row.resetToken === resetToken);
  return match ? fromStoredReset(match) : null;
}

export async function findLatestUnusedPasswordReset(
  email: string,
): Promise<PasswordResetDoc | null> {
  const normalized = email.trim().toLowerCase();
  const store = await readAppStore();
  const matches = store.passwordResets
    .filter((row) => row.email === normalized && !row.isUsed)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return matches[0] ? fromStoredReset(matches[0]) : null;
}

export async function markPasswordResetUsed(resetToken: string): Promise<void> {
  await updateAppStore((store) => {
    const row = store.passwordResets.find((item) => item.resetToken === resetToken);
    if (row) row.isUsed = true;
  });
}

export async function findDashboardUserById(
  userId: string,
): Promise<DashboardUserDoc | null> {
  const store = await readAppStore();
  const match = store.dashboardUsers.find(
    (user) => user.id === userId && user.isActive,
  );
  return match ? fromStoredUser(match) : null;
}

export async function saveDashboardUser(user: DashboardUserDoc): Promise<void> {
  const stored = toStoredUser(user);
  await updateAppStore((store) => {
    const index = store.dashboardUsers.findIndex((row) => row.id === user.id);
    if (index >= 0) store.dashboardUsers[index] = stored;
    else store.dashboardUsers.push(stored);
  });
}

export async function deleteAuthRecordsByEmail(email: string): Promise<void> {
  const normalized = email.trim().toLowerCase();
  await updateAppStore((store) => {
    store.dashboardUsers = store.dashboardUsers.filter(
      (user) => user.email !== normalized,
    );
    store.passwordResets = store.passwordResets.filter(
      (row) => row.email !== normalized,
    );
  });
}
