import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import {
  createSignedResetToken,
  verifySignedResetToken,
} from "@/lib/auth/reset-token";

const TEST_SECRET = "test-reset-secret-at-least-32-characters-long";

describe("reset token", () => {
  before(() => {
    process.env.RESET_TOKEN_SECRET = TEST_SECRET;
    process.env.AUTH_SESSION_SECRET ??= TEST_SECRET;
  });

  it("creates and verifies a signed reset token", () => {
    const token = createSignedResetToken({
      userId: "user-123",
      email: "test@example.com",
    });

    const payload = verifySignedResetToken(token);
    assert.equal(payload.user_type, "dashboard");
    assert.equal(payload.user_id, "user-123");
    assert.equal(payload.email, "test@example.com");
  });

  it("rejects a tampered token", () => {
    const token = createSignedResetToken({
      userId: "user-123",
      email: "test@example.com",
    });
    const tampered = `${token}x`;

    assert.throws(() => verifySignedResetToken(tampered), /Invalid reset token/);
  });

  it("rejects an expired token", () => {
    const token = createSignedResetToken({
      userId: "user-123",
      email: "test@example.com",
      expiresInHours: -1,
    });

    assert.throws(() => verifySignedResetToken(token), /expired/i);
  });
});
