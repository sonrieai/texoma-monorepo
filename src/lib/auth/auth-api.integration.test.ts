import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import { hashPassword } from "@/lib/auth/password";
import {
  AUTH_COLLECTIONS,
  findPasswordResetByToken,
} from "@/lib/auth/users";
import { closeMongoClient, getDb, isMongoConfigured } from "@/lib/mongo/client";

const BASE_URL = process.env.AUTH_TEST_BASE_URL?.trim() || "http://localhost:5001";
const TEST_EMAIL = "texoma-auth-api@example.com";
const TEST_PASSWORD = "TestPass1!";
const NEW_PASSWORD = "TestPass2!";
const TEST_USER_ID = randomUUID();

const mongoConfigured = isMongoConfigured();

async function isServerReachable(): Promise<boolean> {
  try {
    const response = await fetch(`${BASE_URL}/login`, { redirect: "manual" });
    return response.status === 200 || response.status === 307 || response.status === 308;
  } catch {
    return false;
  }
}

async function postJson(path: string, body: unknown) {
  return fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("auth API (HTTP integration)", { skip: !mongoConfigured }, () => {
  let serverUp = false;

  before(async () => {
    serverUp = await isServerReachable();
    if (!serverUp) return;

    const db = await getDb();
    await db.collection(AUTH_COLLECTIONS.dashboardUsers).deleteMany({
      email: TEST_EMAIL,
    });
    await db.collection(AUTH_COLLECTIONS.passwordResets).deleteMany({
      email: TEST_EMAIL,
    });

    await db.collection(AUTH_COLLECTIONS.dashboardUsers).insertOne({
      id: TEST_USER_ID,
      username: "auth-api-test",
      email: TEST_EMAIL,
      passwordHash: hashPassword(TEST_PASSWORD),
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  });

  after(async () => {
    if (!mongoConfigured) return;
    const db = await getDb();
    await db.collection(AUTH_COLLECTIONS.dashboardUsers).deleteMany({
      email: TEST_EMAIL,
    });
    await db.collection(AUTH_COLLECTIONS.passwordResets).deleteMany({
      email: TEST_EMAIL,
    });
    await closeMongoClient();
  });

  it("requires the dev server to be running", () => {
    assert.equal(serverUp, true, `Start the app with npm run dev (${BASE_URL})`);
  });

  it("returns 400 when login payload is incomplete", async () => {
    const response = await postJson("/api/auth/login", { email: TEST_EMAIL });
    assert.equal(response.status, 400);
  });

  it("returns 401 for invalid credentials", async () => {
    const response = await postJson("/api/auth/login", {
      email: TEST_EMAIL,
      password: "WrongPass1!",
    });
    assert.equal(response.status, 401);
    const body = (await response.json()) as { error?: string };
    assert.match(body.error ?? "", /invalid email or password/i);
  });

  it("returns 200 for valid login", async () => {
    const response = await postJson("/api/auth/login", {
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
    });
    assert.equal(response.status, 200);
    const body = (await response.json()) as { ok?: boolean; email?: string };
    assert.equal(body.ok, true);
    assert.equal(body.email, TEST_EMAIL);
    assert.match(response.headers.get("set-cookie") ?? "", /texoma_session=/);
  });

  it("returns 404 for forgot-password on unknown email", async () => {
    const response = await postJson("/api/auth/forgot-password", {
      email: "missing@example.com",
    });
    assert.equal(response.status, 404);
  });

  it("sends forgot-password for a known dashboard user", async () => {
    const response = await postJson("/api/auth/forgot-password", {
      email: TEST_EMAIL,
    });
    assert.equal(response.status, 200);
    const body = (await response.json()) as {
      ok?: boolean;
      emailSent?: boolean;
    };
    assert.equal(body.ok, true);
    assert.equal(body.emailSent, true);
  });

  it("resets password and allows login with the new password", async () => {
    const db = await getDb();
    const latestReset = await db
      .collection(AUTH_COLLECTIONS.passwordResets)
      .find({ email: TEST_EMAIL, isUsed: false })
      .sort({ createdAt: -1 })
      .limit(1)
      .next();

    assert.ok(latestReset?.resetToken, "Expected a password reset token in MongoDB");

    const resetResponse = await postJson("/api/auth/reset-password", {
      resetToken: latestReset.resetToken,
      newPassword: NEW_PASSWORD,
    });
    assert.equal(resetResponse.status, 200);

    const oldLogin = await postJson("/api/auth/login", {
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
    });
    assert.equal(oldLogin.status, 401);

    const newLogin = await postJson("/api/auth/login", {
      email: TEST_EMAIL,
      password: NEW_PASSWORD,
    });
    assert.equal(newLogin.status, 200);

    const usedRecord = await findPasswordResetByToken(latestReset.resetToken);
    assert.equal(usedRecord?.isUsed, true);
  });
});

describe("configured admin login (HTTP smoke)", { skip: !mongoConfigured }, () => {
  let serverUp = false;

  before(async () => {
    serverUp = await isServerReachable();
  });

  it("logs in the configured admin email when credentials match env seed", async () => {
    if (!serverUp) {
      assert.fail(`Start the app with npm run dev (${BASE_URL})`);
    }

    const email = process.env.AUTH_EMAIL?.trim().toLowerCase();
    const password = process.env.AUTH_PASSWORD?.trim();
    assert.ok(email, "AUTH_EMAIL must be set in .env.local");
    assert.ok(password, "AUTH_PASSWORD must be set in .env.local");

    const response = await postJson("/api/auth/login", { email, password });
    assert.equal(
      response.status,
      200,
      `Expected admin login to succeed for ${email}. If this failed after a reset, use Forgot password or update dashboard_users.passwordHash.`,
    );
  });
});
