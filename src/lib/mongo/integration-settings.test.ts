import assert from "node:assert/strict";
import { describe, it, before, after } from "node:test";
import {
  decryptSecret,
  encryptSecret,
  maskApiKey,
} from "@/lib/mongo/integration-settings";

describe("integration-settings encryption", () => {
  const prevSecret = process.env.AUTH_SESSION_SECRET;

  before(() => {
    process.env.AUTH_SESSION_SECRET =
      "test-integration-secret-at-least-32-chars-long";
  });

  after(() => {
    if (prevSecret === undefined) {
      delete process.env.AUTH_SESSION_SECRET;
    } else {
      process.env.AUTH_SESSION_SECRET = prevSecret;
    }
  });

  it("encrypts and decrypts round-trip", () => {
    const plain = "pit-test-key-abc123xyz";
    const stored = encryptSecret(plain);
    assert.notEqual(stored, plain);
    assert.equal(decryptSecret(stored), plain);
  });

  it("masks api keys for display", () => {
    assert.equal(maskApiKey("abcdefghijklmnop"), "••••••••mnop");
    assert.equal(maskApiKey("ab"), "••••");
  });
});
