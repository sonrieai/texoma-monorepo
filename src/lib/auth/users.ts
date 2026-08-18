import "server-only";

import { randomUUID } from "node:crypto";
import type { Collection, Document } from "mongodb";
import { getAuthEmail, getAuthUsername } from "@/lib/auth/config";
import { hashPassword, verifyPasswordHash } from "@/lib/auth/password";
import { getDb, isMongoConfigured } from "@/lib/mongo/client";

export const AUTH_COLLECTIONS = {
  dashboardUsers: "dashboard_users",
  passwordResets: "password_resets",
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

async function usersCollection(): Promise<Collection<DashboardUserDoc>> {
  const db = await getDb();
  return db.collection<DashboardUserDoc>(AUTH_COLLECTIONS.dashboardUsers);
}

async function resetsCollection(): Promise<Collection<PasswordResetDoc>> {
  const db = await getDb();
  return db.collection<PasswordResetDoc>(AUTH_COLLECTIONS.passwordResets);
}

export async function ensureAuthIndexes(): Promise<void> {
  if (!isMongoConfigured()) return;
  const db = await getDb();
  await db.collection(AUTH_COLLECTIONS.dashboardUsers).createIndex(
    { username: 1 },
    { unique: true, name: "username_uq" },
  );
  await db.collection(AUTH_COLLECTIONS.dashboardUsers).createIndex(
    { email: 1 },
    { unique: true, name: "email_uq" },
  );
  await db.collection(AUTH_COLLECTIONS.passwordResets).createIndex(
    { resetToken: 1 },
    { unique: true, name: "reset_token_uq" },
  );
  await db.collection(AUTH_COLLECTIONS.passwordResets).createIndex(
    { email: 1, createdAt: -1 },
    { name: "email_created" },
  );
}

export async function ensureDashboardAdminFromEnv(): Promise<DashboardUserDoc | null> {
  if (!isMongoConfigured()) return null;

  const envPassword = process.env.AUTH_PASSWORD?.trim();
  if (!envPassword) return null;

  const col = await usersCollection();
  const existingCount = await col.countDocuments({});
  if (existingCount > 0) return null;

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

  await col.insertOne(user);
  return user;
}

export async function findDashboardUserByEmail(
  email: string,
): Promise<DashboardUserDoc | null> {
  if (!isMongoConfigured()) return null;

  await ensureDashboardAdminFromEnv();
  const col = await usersCollection();
  return col.findOne({
    isActive: true,
    email: email.trim().toLowerCase(),
  });
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
  const col = await usersCollection();
  const result = await col.updateOne(
    { id: userId, isActive: true },
    {
      $set: {
        passwordHash: hashPassword(newPassword),
        updatedAt: new Date(),
        lastPasswordReset: new Date(),
      },
    },
  );
  return result.matchedCount === 1;
}

export async function countRecentPasswordResetRequests(
  email: string,
  windowMs: number,
): Promise<number> {
  const col = await resetsCollection();
  return col.countDocuments({
    email: email.trim().toLowerCase(),
    createdAt: { $gte: new Date(Date.now() - windowMs) },
  });
}

export async function insertPasswordResetRecord(input: {
  userId: string;
  email: string;
  resetToken: string;
  expiresAt: Date;
}): Promise<void> {
  const col = await resetsCollection();
  await col.insertOne({
    id: randomUUID(),
    userId: input.userId,
    email: input.email.trim().toLowerCase(),
    resetToken: input.resetToken,
    isUsed: false,
    expiresAt: input.expiresAt,
    createdAt: new Date(),
  });
}

export async function findPasswordResetByToken(
  resetToken: string,
): Promise<PasswordResetDoc | null> {
  const col = await resetsCollection();
  return col.findOne({ resetToken });
}

export async function markPasswordResetUsed(resetToken: string): Promise<void> {
  const col = await resetsCollection();
  await col.updateOne({ resetToken }, { $set: { isUsed: true } });
}

export async function findDashboardUserById(
  userId: string,
): Promise<DashboardUserDoc | null> {
  const col = await usersCollection();
  return col.findOne({ id: userId, isActive: true });
}

export type AuthMongoDoc = Document;
