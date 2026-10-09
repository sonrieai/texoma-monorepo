import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { verifyLogin } from "@/lib/auth/credentials";
import { hashPassword, verifyPasswordHash } from "@/lib/auth/password";
import { createSignedResetToken, getResetTokenTtlMs } from "@/lib/auth/reset-token";
import {
  deleteAuthRecordsByEmail,
  findDashboardUserByEmail,
  findPasswordResetByToken,
  insertPasswordResetRecord,
  markPasswordResetUsed,
  saveDashboardUser,
  updateDashboardUserPassword,
} from "@/lib/auth/users";

const TEST_EMAIL = "texoma-auth-test@example.com";
const TEST_PASSWORD = "TestPass1!";
const NEW_PASSWORD = "TestPass2!";
const TEST_USER_ID = "texoma-auth-test-user";

describe("auth flow (JSON store)", () => {
  let storeDir = "";

  before(async () => {
    process.env.AUTH_SESSION_SECRET ??=
      "integration-test-session-secret-32chars-min";
    process.env.RESET_TOKEN_SECRET ??=
      "integration-test-reset-secret-32chars-min";

    storeDir = await mkdtemp(path.join(tmpdir(), "texoma-auth-"));
    process.env.JSON_STORE_PATH = path.join(storeDir, "store.json");

    const now = new Date();
    await saveDashboardUser({
      id: TEST_USER_ID,
      username: "auth-test",
      email: TEST_EMAIL,
      passwordHash: hashPassword(TEST_PASSWORD),
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });
  });

  after(async () => {
    await deleteAuthRecordsByEmail(TEST_EMAIL);
    if (storeDir) await rm(storeDir, { recursive: true, force: true });
  });

  it("logs in with a valid email and password from the JSON store", async () => {
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
