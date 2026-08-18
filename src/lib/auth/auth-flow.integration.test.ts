import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import { verifyLogin } from "@/lib/auth/credentials";
import { hashPassword, verifyPasswordHash } from "@/lib/auth/password";
import { createSignedResetToken, getResetTokenTtlMs } from "@/lib/auth/reset-token";
import {
  AUTH_COLLECTIONS,
  findDashboardUserByEmail,
  findPasswordResetByToken,
  insertPasswordResetRecord,
  markPasswordResetUsed,
  updateDashboardUserPassword,
} from "@/lib/auth/users";
import { closeMongoClient, getDb, isMongoConfigured } from "@/lib/mongo/client";

const TEST_EMAIL = "texoma-auth-test@example.com";
const TEST_PASSWORD = "TestPass1!";
const NEW_PASSWORD = "TestPass2!";
const TEST_USER_ID = "texoma-auth-test-user";

const mongoConfigured = isMongoConfigured();

describe("auth flow (MongoDB integration)", { skip: !mongoConfigured }, () => {
  before(async () => {
    process.env.AUTH_SESSION_SECRET ??=
      "integration-test-session-secret-32chars-min";
    process.env.RESET_TOKEN_SECRET ??=
      "integration-test-reset-secret-32chars-min";

    const db = await getDb();
    await db.collection(AUTH_COLLECTIONS.dashboardUsers).deleteMany({
      email: TEST_EMAIL,
    });
    await db.collection(AUTH_COLLECTIONS.passwordResets).deleteMany({
      email: TEST_EMAIL,
    });

    await db.collection(AUTH_COLLECTIONS.dashboardUsers).insertOne({
      id: TEST_USER_ID,
      username: "auth-test",
      email: TEST_EMAIL,
      passwordHash: hashPassword(TEST_PASSWORD),
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  });

  after(async () => {
    const db = await getDb();
    await db.collection(AUTH_COLLECTIONS.dashboardUsers).deleteMany({
      email: TEST_EMAIL,
    });
    await db.collection(AUTH_COLLECTIONS.passwordResets).deleteMany({
      email: TEST_EMAIL,
    });
    await closeMongoClient();
  });

  it("logs in with a valid email and password from MongoDB", async () => {
    const result = await verifyLogin(TEST_EMAIL, TEST_PASSWORD);
    assert.ok(result);
    assert.equal(result.email, TEST_EMAIL);
    assert.equal(result.userId, TEST_USER_ID);
  });

  it("rejects an invalid password", async () => {
    const result = await verifyLogin(TEST_EMAIL, "WrongPass1!");
    assert.equal(result, null);
  });

  it("rejects an unknown email", async () => {
    const result = await verifyLogin("missing@example.com", TEST_PASSWORD);
    assert.equal(result, null);
  });

  it("resets password via signed token and DB audit record", async () => {
    const resetToken = createSignedResetToken({
      userId: TEST_USER_ID,
      email: TEST_EMAIL,
    });
    const expiresAt = new Date(Date.now() + getResetTokenTtlMs());

    await insertPasswordResetRecord({
      userId: TEST_USER_ID,
      email: TEST_EMAIL,
      resetToken,
      expiresAt,
    });

    const updated = await updateDashboardUserPassword(TEST_USER_ID, NEW_PASSWORD);
    assert.equal(updated, true);
    await markPasswordResetUsed(resetToken);

    const resetRecord = await findPasswordResetByToken(resetToken);
    assert.ok(resetRecord?.isUsed);

    assert.equal(await verifyLogin(TEST_EMAIL, TEST_PASSWORD), null);
    const login = await verifyLogin(TEST_EMAIL, NEW_PASSWORD);
    assert.ok(login);

    const user = await findDashboardUserByEmail(TEST_EMAIL);
    assert.ok(user);
    assert.equal(verifyPasswordHash(NEW_PASSWORD, user.passwordHash), true);
    assert.equal(verifyPasswordHash(TEST_PASSWORD, user.passwordHash), false);
  });
});
